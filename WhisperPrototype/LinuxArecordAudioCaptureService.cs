using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using NAudio.Wave;
using Spectre.Console;

namespace WhisperPrototype;

public class LinuxArecordAudioCaptureService : IAudioCaptureService
{
    private Process? _arecordProcess;
    private CancellationTokenSource? _cancellationTokenSource;
    private Task? _audioReadingTask;
    private WaveFormat? _currentWaveFormat;

    public event EventHandler<AudioDataAvailableEventArgs>? AudioDataAvailable;
    public WaveFormat? CurrentWaveFormat => _currentWaveFormat;

    // Regex to parse output of arecord -l
    // Example: card 0: Generic [HD-Audio Generic], device 0: ALC897 Analog [ALC897 Analog]
    private static readonly Regex ArecordDeviceRegex = 
        new Regex(@"^card\s+(\d+):\s+.*?\s+\[([^\]]+)\],\s+device\s+(\d+):\s+.*?\s+\[([^\]]+)\]", RegexOptions.Compiled);

    public async Task<IEnumerable<AudioDevice>> GetAvailableDevicesAsync()
    {
        var devices = new List<AudioDevice>();
        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "arecord",
                    Arguments = "-l",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };
            process.Start();
            var output = await process.StandardOutput.ReadToEndAsync();
            var error = await process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode != 0 || !string.IsNullOrWhiteSpace(error))
            {
                AnsiConsole.MarkupLine($"[red]arecord -l error (Exit Code: {process.ExitCode}): {Markup.Escape(error)}[/]");
                AnsiConsole.MarkupLine("[yellow]Ensure 'arecord' (from alsa-utils) is installed and accessible.[/]");
                return Enumerable.Empty<AudioDevice>();
            }

            var lines = output.Split(new[] { Environment.NewLine }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var line in lines)
            {
                var match = ArecordDeviceRegex.Match(line);
                if (match.Success)
                {
                    var cardNum = match.Groups[1].Value;
                    var cardName = match.Groups[2].Value;
                    var deviceNum = match.Groups[3].Value;
                    var deviceName = match.Groups[4].Value;
                    var deviceId = $"hw:{cardNum},{deviceNum}";
                    var displayName = $"{cardName} - {deviceName} ({deviceId})";
                    devices.Add(new AudioDevice(deviceId, displayName));
                }
            }
        }
        catch (Exception ex) // Catches issues like arecord not found
        {
            AnsiConsole.MarkupLine($"[red]Error listing audio devices with arecord: {Markup.Escape(ex.Message)}[/]");
            AnsiConsole.MarkupLine("[yellow]Ensure 'arecord' (from alsa-utils) is installed and accessible.[/]");
            return Enumerable.Empty<AudioDevice>();
        }

        if (!devices.Any())
        {
            AnsiConsole.MarkupLine("[yellow]arecord: No capture devices found by 'arecord -l'.[/]");
        }
        return devices;
    }

    public Task StartCaptureAsync(string deviceId, WaveFormat waveFormat)
    {
        if (_arecordProcess != null)
        {
            throw new InvalidOperationException("Capture is already in progress.");
        }
        // Validate WaveFormat for arecord settings
        if (waveFormat.SampleRate != 16000 || waveFormat.BitsPerSample != 16 || waveFormat.Channels != 1)
        {
            throw new ArgumentException("arecord service currently only supports 16kHz, 16-bit, Mono PCM format.", nameof(waveFormat));
        }
        _currentWaveFormat = waveFormat;

        _cancellationTokenSource = new CancellationTokenSource();
        var token = _cancellationTokenSource.Token;

        _arecordProcess = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "arecord",
                Arguments = $"-D {deviceId} -f S16_LE -r 16000 -c 1 -t raw",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            },
            EnableRaisingEvents = true // Important for Process.Exited event if used later
        };

        try
        {
            _arecordProcess.Start();
            AnsiConsole.MarkupLine($"[green]arecord: Process started for device {deviceId}.[/]");

            _audioReadingTask = Task.Run(async () =>
            {
                try
                {
                    // Buffer size: e.g., 16000 (samples/sec) * 2 (bytes/sample) * 0.1 (100ms) = 3200 bytes
                    // Or a common multiple like 4096. BlockAlign for 16bit mono is 2.
                    var bufferSize = _currentWaveFormat.BlockAlign * 2048; // Approx 0.25s of audio
                    var buffer = new byte[bufferSize];
                    
                    AnsiConsole.MarkupLine($"[grey]arecord: Reading audio stream (buffer size: {bufferSize} bytes)...[/]");
                    using var outputStream = _arecordProcess.StandardOutput.BaseStream;
                    while (!token.IsCancellationRequested)
                    {
                        var bytesRead = await outputStream.ReadAsync(buffer, 0, buffer.Length, token);
                        if (bytesRead > 0)
                        {
                            // Create a copy of the relevant part of the buffer for the event args
                            var eventBuffer = new byte[bytesRead];
                            Array.Copy(buffer, 0, eventBuffer, 0, bytesRead);
                            AudioDataAvailable?.Invoke(this, new AudioDataAvailableEventArgs(eventBuffer, bytesRead));
                        }
                        else if (bytesRead == 0) // End of stream
                        {
                            AnsiConsole.MarkupLine("[yellow]arecord: Audio stream ended.[/]");
                            break; 
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    AnsiConsole.MarkupLine("[grey]arecord: Audio reading task canceled.[/]");
                }
                catch (Exception ex)
                {
                    AnsiConsole.MarkupLine($"[red]arecord: Error reading audio stream: {Markup.Escape(ex.Message)}[/]");
                }
                finally
                {
                    AnsiConsole.MarkupLine("[grey]arecord: Audio reading task finished.[/]");
                }
            }, token);
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]arecord: Failed to start process - {Markup.Escape(ex.Message)}[/]");
            AnsiConsole.MarkupLine("[yellow]Ensure 'arecord' is installed, device ID is correct, and mic is not in use.[/]");
            _arecordProcess?.Dispose();
            _arecordProcess = null;
            _cancellationTokenSource?.Dispose();
            _cancellationTokenSource = null;
            throw;
        }
        return Task.CompletedTask;
    }

    public async Task StopCaptureAsync()
    {
        if (_cancellationTokenSource != null && !_cancellationTokenSource.IsCancellationRequested)
        {
            _cancellationTokenSource.Cancel();
        }

        if (_arecordProcess != null)
        {
            try
            {
                if (!_arecordProcess.HasExited)
                {
                    AnsiConsole.MarkupLine("[grey]arecord: Attempting to stop process...[/]");
                    _arecordProcess.Kill(true); // true to kill entire process tree
                    await _arecordProcess.WaitForExitAsync(CancellationToken.None); // Wait briefly // TimeSpan.FromSeconds(5)
                    if (!_arecordProcess.HasExited)
                    {
                         AnsiConsole.MarkupLine("[yellow]arecord: Process did not exit gracefully after kill signal. It might be stuck.[/]");
                    }
                }
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine($"[red]arecord: Exception while stopping process: {Markup.Escape(ex.Message)}[/]");
            }
            finally
            {
                _arecordProcess.Dispose();
                _arecordProcess = null;
                AnsiConsole.MarkupLine("[cyan]arecord: Process stopped and disposed.[/]");
            }
        }

        if (_audioReadingTask != null)
        {
            AnsiConsole.MarkupLine("[grey]arecord: Waiting for audio reading task to complete...[/]");
            try
            {
                await _audioReadingTask; // Wait for the task to finish
            }
            catch (OperationCanceledException) { /* Expected if cancelled */ }
            catch (Exception ex) 
            {
                AnsiConsole.MarkupLine($"[red]arecord: Exception during audio reading task completion: {Markup.Escape(ex.Message)}[/]");
            }
            _audioReadingTask = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopCaptureAsync();
        _cancellationTokenSource?.Dispose();
        _cancellationTokenSource = null;
        AnsiConsole.MarkupLine("[grey]arecord: Service disposed.[/]");
        // GC.SuppressFinalize(this);
    }
} 