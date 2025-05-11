using System.Diagnostics;
using System.Text.RegularExpressions;
using NAudio.Wave;
using Spectre.Console;

namespace WhisperPrototype;

public class WslPulseAudioCaptureService : IAudioCaptureService
{
    private Process? _parecProcess;
    private CancellationTokenSource? _cancellationTokenSource;
    private Task? _audioReadingTask;
    private WaveFormat? _currentWaveFormat;

    public event EventHandler<AudioDataAvailableEventArgs>? AudioDataAvailable;
    public WaveFormat? CurrentWaveFormat => _currentWaveFormat;

    // Regex to parse output of `pactl list sources short`
    // Example line: 1    alsa_input.pci-0000_01_00.1.analog-stereo    module-alsa-card.c    s16le 2ch 44100Hz    SUSPENDED
    // We are interested in the second field (name/ID) and often the fifth (description part of format) can be a human-readable name.
    // Simpler approach: use the 'name' as ID and try to parse a description if available.
    // Focusing on the source name as ID: field 1 (index) and field 2 (name)
    private static readonly Regex PactlDeviceRegex = 
        new Regex(@"^\s*(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)$", RegexOptions.Compiled);


    public async Task<AudioInputDevice[]> GetAvailableDevicesAsync()
    {
        var devices = new List<AudioInputDevice>();
        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "pactl",
                    Arguments = "list sources short",
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
                AnsiConsole.MarkupLine($"[red]pactl list sources short error (Exit Code: {process.ExitCode}): {Markup.Escape(error)}[/]");
                AnsiConsole.MarkupLine("[yellow]Ensure 'pactl' (from pulseaudio-utils) is installed and PulseAudio is running in WSL.[/]");
                return [];
            }

            var lines = output.Split(new[] { Environment.NewLine }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var line in lines)
            {
                var match = PactlDeviceRegex.Match(line);
                if (match.Success)
                {
                    // string index = match.Groups[1].Value; // Not used as ID directly
                    var sourceName = match.Groups[2].Value; // This is the PulseAudio source name, use as ID
                    // string driver = match.Groups[3].Value;
                    // string format = match.Groups[4].Value;
                    var description = match.Groups[5].Value.Split('\t').LastOrDefault()?.Trim() ?? sourceName;
                    // Attempt to make a more friendly display name, fallback to sourceName
                    var displayName = string.IsNullOrWhiteSpace(description) || description.StartsWith("s16le") ? sourceName : $"{description} ({sourceName})";

                    devices.Add(new AudioInputDevice(sourceName, displayName));
                }
            }
        }
        catch (Exception ex) // Catches issues like pactl not found
        {
            AnsiConsole.MarkupLine($"[red]Error listing audio devices with pactl: {Markup.Escape(ex.Message)}[/]");
            AnsiConsole.MarkupLine("[yellow]Ensure 'pactl' (from pulseaudio-utils) is installed and PulseAudio is running in WSL.[/]");
            return [];
        }

        if (!devices.Any())
        {
            AnsiConsole.MarkupLine("[yellow]pactl: No capture sources found by 'pactl list sources short'. Check WSL PulseAudio setup.[/]");
        }
        return devices.ToArray();
    }

    public Task StartCaptureAsync(string deviceId, WaveFormat waveFormat)
    {
        if (_parecProcess != null)
        {
            throw new InvalidOperationException("Capture is already in progress.");
        }
        if (waveFormat.SampleRate != 16000 || waveFormat.BitsPerSample != 16 || waveFormat.Channels != 1)
        {
            throw new ArgumentException("parec service currently only supports 16kHz, 16-bit, Mono PCM format.", nameof(waveFormat));
        }
        _currentWaveFormat = waveFormat;

        _cancellationTokenSource = new CancellationTokenSource();
        var token = _cancellationTokenSource.Token;

        // Command: parec --device={deviceId} --format=s16le --rate=16000 --channels=1 --raw
        // Note: parec uses --format=s16ne for native-endian or s16le/s16be. Whisper expects little-endian.
        _parecProcess = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "parec",
                Arguments = $"--device={deviceId} --format=s16le --rate=16000 --channels=1 --raw",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            },
            EnableRaisingEvents = true
        };

        try
        {
            _parecProcess.Start();
            AnsiConsole.MarkupLine($"[green]parec (WSL): Process started for device {deviceId}.[/]");

            _audioReadingTask = Task.Run(async () =>
            {
                try
                {
                    var bufferSize = _currentWaveFormat.BlockAlign * 2048; // Approx 0.25s of audio (16000*2*0.25 = 8000, BlockAlign=2)
                    var buffer = new byte[bufferSize];
                    AnsiConsole.MarkupLine($"[grey]parec (WSL): Reading audio stream (buffer size: {bufferSize} bytes)...[/]");
                    using var outputStream = _parecProcess.StandardOutput.BaseStream;
                    while (!token.IsCancellationRequested)
                    {
                        var bytesRead = await outputStream.ReadAsync(buffer, 0, buffer.Length, token);
                        if (bytesRead > 0)
                        {
                            var eventBuffer = new byte[bytesRead];
                            Array.Copy(buffer, 0, eventBuffer, 0, bytesRead);
                            AudioDataAvailable?.Invoke(this, new AudioDataAvailableEventArgs(eventBuffer, bytesRead));
                        }
                        else if (bytesRead == 0) 
                        {
                            AnsiConsole.MarkupLine("[yellow]parec (WSL): Audio stream ended.[/]");
                            break;
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    AnsiConsole.MarkupLine("[grey]parec (WSL): Audio reading task canceled.[/]");
                }
                catch (Exception ex)
                {
                    AnsiConsole.MarkupLine($"[red]parec (WSL): Error reading audio stream: {Markup.Escape(ex.Message)}[/]");
                }
                finally
                {
                    AnsiConsole.MarkupLine("[grey]parec (WSL): Audio reading task finished.[/]");
                }
            }, token);
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]parec (WSL): Failed to start process - {Markup.Escape(ex.Message)}[/]");
            AnsiConsole.MarkupLine("[yellow]Ensure 'parec' (pulseaudio-utils) is installed, PulseAudio is running in WSL, and device ID is correct.[/]");
            _parecProcess?.Dispose();
            _parecProcess = null;
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

        if (_parecProcess != null)
        {
            try
            {
                if (!_parecProcess.HasExited)
                {
                    AnsiConsole.MarkupLine("[grey]parec (WSL): Attempting to stop process...[/]");
                    _parecProcess.Kill(true);
                    await _parecProcess.WaitForExitAsync(CancellationToken.None);
                    if (!_parecProcess.HasExited)
                    {
                         AnsiConsole.MarkupLine("[yellow]parec (WSL): Process did not exit gracefully after kill signal.[/]");
                    }
                }
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine($"[red]parec (WSL): Exception while stopping process: {Markup.Escape(ex.Message)}[/]");
            }
            finally
            {
                _parecProcess.Dispose();
                _parecProcess = null;
                AnsiConsole.MarkupLine("[cyan]parec (WSL): Process stopped and disposed.[/]");
            }
        }

        if (_audioReadingTask != null)
        {
            AnsiConsole.MarkupLine("[grey]parec (WSL): Waiting for audio reading task to complete...[/]");
            try
            {
                await _audioReadingTask;
            }
            catch (OperationCanceledException) { /* Expected */ }
            catch (Exception ex) 
            {
                AnsiConsole.MarkupLine($"[red]parec (WSL): Exception during audio reading task completion: {Markup.Escape(ex.Message)}[/]");
            }
            _audioReadingTask = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopCaptureAsync();
        _cancellationTokenSource?.Dispose();
        _cancellationTokenSource = null;
        AnsiConsole.MarkupLine("[grey]parec (WSL): Service disposed.[/]");
    }
} 