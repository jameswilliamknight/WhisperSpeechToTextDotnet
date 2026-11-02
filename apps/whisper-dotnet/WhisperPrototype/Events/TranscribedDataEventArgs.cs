namespace WhisperPrototype.Events;

public class TranscribedDataEventArgs(string transcribedText) : EventArgs
{
    public string TranscribedText { get; } = transcribedText;
}