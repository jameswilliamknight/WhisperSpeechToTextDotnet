namespace WhisperPrototype.Events;

/// <summary>
///     Event arguments for when audio data is available.
/// </summary>
public class AudioDataAvailableEventArgs(byte[] buffer, int bytesRecorded) : EventArgs
{
    public byte[] Buffer { get; } = buffer;
    public int BytesRecorded { get; } = bytesRecorded;
}