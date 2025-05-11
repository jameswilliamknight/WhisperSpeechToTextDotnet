using System.Diagnostics;
using System.Text.RegularExpressions;
using NAudio.Wave;
using Spectre.Console;

namespace WhisperPrototype;

/// <summary>
///     ⚠️ Warning, this hasn't been tested.
/// </summary>
public class BareMetalAlsaAudioCaptureService : IAudioCaptureService
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
        new Regex(@"^card\s+(\d+):\s+.*?\s+\[([^\]]+)\],\s+device\s+(\d+):\s+.*?\s+\[([^\]]+)\]",
            RegexOptions.Compiled);

    public async Task<AudioInputDevice[]> GetAvailableDevicesAsync()
    {
        var devices = new List<AudioInputDevice>();
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
                AnsiConsole.MarkupLine(
                    $"[red]arecord -l error (Exit Code: {process.ExitCode}): {Markup.Escape(error)}[/]");
                AnsiConsole.MarkupLine(
                    "[yellow]Ensure 'arecord' (from alsa-utils) is installed and accessible for bare metal Linux.[/]");
                return [];
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
                    devices.Add(new AudioInputDevice(deviceId, displayName));
                }
            }
        }
        catch (Exception ex) // Catches issues like arecord not found
        {
            AnsiConsole.MarkupLine(
                $"[red]Error listing audio devices with arecord (bare metal): {Markup.Escape(ex.Message)}[/]");
            AnsiConsole.MarkupLine("[yellow]Ensure 'arecord' (from alsa-utils) is installed.[/]");
            return [];
        }

        if (!devices.Any())
        {
            AnsiConsole.MarkupLine("[yellow]arecord (bare metal): No capture devices found by 'arecord -l'.[/]");
        }

        return devices.ToArray();
    }

    public Task StartCaptureAsync(string deviceId, WaveFormat waveFormat)
    {
        if (_arecordProcess != null)
        {
            throw new InvalidOperationException("Capture is already in progress.");
        }

        if (waveFormat.SampleRate != 16000 || waveFormat.BitsPerSample != 16 || waveFormat.Channels != 1)
        {
            throw new ArgumentException(
                "arecord service (bare metal) currently only supports 16kHz, 16-bit, Mono PCM format.",
                nameof(waveFormat));
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
            EnableRaisingEvents = true
        };

        try
        {
            _arecordProcess.Start();
            AnsiConsole.MarkupLine($"[green]arecord (bare metal): Process started for device {deviceId}.[/]");

            _audioReadingTask = Task.Run(async () =>
            {
                try
                {
                    var bufferSize = _currentWaveFormat.BlockAlign * 2048;
                    var buffer = new byte[bufferSize];

                    AnsiConsole.MarkupLine(
                        $"[grey]arecord (bare metal): Reading audio stream (buffer size: {bufferSize} bytes)...[/]");
                    using var outputStream = _arecordProcess.StandardOutput.BaseStream;
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
                            AnsiConsole.MarkupLine("[yellow]arecord (bare metal): Audio stream ended.[/]");
                            break;
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    AnsiConsole.MarkupLine("[grey]arecord (bare metal): Audio reading task canceled.[/]");
                }
                catch (Exception ex)
                {
                    AnsiConsole.MarkupLine(
                        $"[red]arecord (bare metal): Error reading audio stream: {Markup.Escape(ex.Message)}[/]");
                }
                finally
                {
                    AnsiConsole.MarkupLine("[grey]arecord (bare metal): Audio reading task finished.[/]");
                }
            }, token);
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine(
                $"[red]arecord (bare metal): Failed to start process - {Markup.Escape(ex.Message)}[/]");
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
                    AnsiConsole.MarkupLine("[grey]arecord (bare metal): Attempting to stop process...[/]");
                    _arecordProcess.Kill(true);
                    await _arecordProcess.WaitForExitAsync(CancellationToken.None);
                    if (!_arecordProcess.HasExited)
                    {
                        AnsiConsole.MarkupLine(
                            "[yellow]arecord (bare metal): Process did not exit gracefully after kill signal.[/]");
                    }
                }
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine(
                    $"[red]arecord (bare metal): Exception while stopping process: {Markup.Escape(ex.Message)}[/]");
            }
            finally
            {
                _arecordProcess.Dispose();
                _arecordProcess = null;
                AnsiConsole.MarkupLine("[cyan]arecord (bare metal): Process stopped and disposed.[/]");
            }
        }

        if (_audioReadingTask != null)
        {
            AnsiConsole.MarkupLine("[grey]arecord (bare metal): Waiting for audio reading task to complete...[/]");
            try
            {
                await _audioReadingTask;
            }
            catch (OperationCanceledException)
            {
                /* Expected */
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine(
                    $"[red]arecord (bare metal): Exception during audio reading task completion: {Markup.Escape(ex.Message)}[/]");
            }

            _audioReadingTask = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopCaptureAsync();
        _cancellationTokenSource?.Dispose();
        _cancellationTokenSource = null;
        AnsiConsole.MarkupLine("[grey]arecord (bare metal): Service disposed.[/]");
    }
}