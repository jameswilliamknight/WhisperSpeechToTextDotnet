namespace WhisperPrototype;

public interface IWorkspace
{
    Task Process(IEnumerable<FileInfo> audioFiles);
    FileInfo[] GetAudioRecordings();
}