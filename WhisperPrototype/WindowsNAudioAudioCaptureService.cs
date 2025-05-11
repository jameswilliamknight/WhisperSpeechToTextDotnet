using NAudio.Wave;
using Spectre.Console;

namespace WhisperPrototype;

public class WindowsNAudioAudioCaptureService : IAudioCaptureService
{
    private WaveInEvent? _waveIn;
    public event EventHandler<AudioDataAvailableEventArgs>? AudioDataAvailable;

    public WaveFormat? CurrentWaveFormat => _waveIn?.WaveFormat;

    public Task<IEnumerable<AudioDevice>> GetAvailableDevicesAsync()
    {
        var devices = new List<AudioDevice>();
        if (WaveInEvent.DeviceCount == 0)
        {
            AnsiConsole.MarkupLine("[yellow]NAudio: No audio input devices found.[/]");
            return Task.FromResult(Enumerable.Empty<AudioDevice>());
        }

        for (var i = 0; i < WaveInEvent.DeviceCount; i++)
        {
            var caps = WaveInEvent.GetCapabilities(i);
            devices.Add(new AudioDevice(i.ToString(), caps.ProductName));
        }
        return Task.FromResult<IEnumerable<AudioDevice>>(devices);
    }

    public Task StartCaptureAsync(string deviceId, WaveFormat waveFormat)
    {
        if (_waveIn != null)
        {
            throw new InvalidOperationException("Capture is already in progress.");
        }

        if (!int.TryParse(deviceId, out var deviceNumber))
        {
            throw new ArgumentException("Device ID must be a valid integer for NAudio.", nameof(deviceId));
        }

        _waveIn = new WaveInEvent
        {
            DeviceNumber = deviceNumber,
            WaveFormat = waveFormat
        };

        _waveIn.DataAvailable += OnDataAvailable;
        
        try
        {
            _waveIn.StartRecording();
            AnsiConsole.MarkupLine("[green]NAudio: Recording started.[/]");
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]NAudio: Error starting recording - {Markup.Escape(ex.Message)}[/]");
            _waveIn.DataAvailable -= OnDataAvailable; // Unsubscribe on failure
            _waveIn.Dispose();
            _waveIn = null;
            throw; // Re-throw the exception to be caught by the calling code
        }
        return Task.CompletedTask;
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        AudioDataAvailable?.Invoke(this, new AudioDataAvailableEventArgs(e.Buffer, e.BytesRecorded));
    }

    public Task StopCaptureAsync()
    {
        if (_waveIn == null)
        {
            return Task.CompletedTask; // Not recording
        }

        _waveIn.StopRecording();
        AnsiConsole.MarkupLine("[cyan]NAudio: Recording stopped.[/]");
        return Task.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        if (_waveIn != null)
        {
            await StopCaptureAsync(); // Ensure recording is stopped
            _waveIn.DataAvailable -= OnDataAvailable;
            _waveIn.Dispose();
            _waveIn = null;
            AnsiConsole.MarkupLine("[grey]NAudio: Service disposed.[/]");
        }
        // Suppress finalization. GC.SuppressFinalize(this);
    }
} 