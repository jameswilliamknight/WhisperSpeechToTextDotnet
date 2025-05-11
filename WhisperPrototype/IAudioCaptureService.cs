using NAudio.Wave; // For WaveFormat and other NAudio types if needed by implementations

namespace WhisperPrototype;

/// <summary>
/// Represents an audio input device.
/// </summary>
public record AudioDevice(string Id, string Name);

/// <summary>
/// Event arguments for when audio data is available.
/// </summary>
public class AudioDataAvailableEventArgs : EventArgs
{
    public byte[] Buffer { get; }
    public int BytesRecorded { get; }

    public AudioDataAvailableEventArgs(byte[] buffer, int bytesRecorded)
    {
        Buffer = buffer;
        BytesRecorded = bytesRecorded;
    }
}

/// <summary>
/// Provides an abstraction for capturing audio from input devices.
/// </summary>
public interface IAudioCaptureService : IAsyncDisposable
{
    /// <summary>
    /// Event raised when new audio data is available.
    /// </summary>
    event EventHandler<AudioDataAvailableEventArgs>? AudioDataAvailable;

    /// <summary>
    /// Gets a list of available audio input devices.
    /// </summary>
    /// <returns>A list of <see cref="AudioDevice"/> objects.</returns>
    Task<IEnumerable<AudioDevice>> GetAvailableDevicesAsync();

    /// <summary>
    /// Starts capturing audio from the specified device with the given format.
    /// </summary>
    /// <param name="deviceId">The ID of the device to capture from. Implementations will define how this ID is used (e.g., device number for NAudio, ALSA device string for arecord).</param>
    /// <param name="waveFormat">The desired audio format (e.g., 16kHz, 16-bit mono PCM).</param>
    /// <returns>A task representing the asynchronous operation.</returns>
    Task StartCaptureAsync(string deviceId, WaveFormat waveFormat);

    /// <summary>
    /// Stops audio capture.
    /// </summary>
    /// <returns>A task representing the asynchronous operation.</returns>
    Task StopCaptureAsync();

    /// <summary>
    /// Gets the current wave format of the audio being captured.
    /// Null if capture has not started or is not configured.
    /// </summary>
    WaveFormat? CurrentWaveFormat { get; }
} 