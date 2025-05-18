using WhisperPrototype.Events;

namespace WhisperPrototype.Framework;

public interface IWorkspace
{
    Task TranscribeAll(IEnumerable<FileInfo> audioFiles);
    FileInfo[] GetAudioRecordings();
    Task StartLiveTranscriptionAsync();
    Task<bool> SelectModelAsync();
    void LoadModel(FileInfo selectedModelFile);
    event EventHandler<TranscribedDataEventArgs>? TranscribedDataAvailable;
}