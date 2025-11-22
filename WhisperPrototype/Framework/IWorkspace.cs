using WhisperPrototype.Events;

namespace WhisperPrototype.Framework;

public interface IWorkspace
{
    Task TranscribeAll(IEnumerable<FileInfo> audioFiles);
    FileInfo[] GetAudioRecordings();
    Task StartLiveTranscriptionAsync();
    Task<bool> SelectModelAsync(bool silent = false);
    void LoadModel(FileInfo selectedModelFile);
    bool IsModelLoaded { get; }
    string? ModelName { get; }
    event EventHandler<TranscribedDataEventArgs>? TranscribedDataAvailable;
}