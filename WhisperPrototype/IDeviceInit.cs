namespace WhisperPrototype;

public interface IWorkspace
{
    Task Process(IEnumerable<FileInfo> audioFiles);
    FileInfo[] GetAudioRecordings();
    Task StartLiveTranscriptionAsync();
    event EventHandler<TranscribedDataEventArgs>? TranscribedDataAvailable;
}