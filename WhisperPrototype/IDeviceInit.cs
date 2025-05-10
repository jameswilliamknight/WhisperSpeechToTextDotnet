namespace WhisperPrototype;

public interface IWorkspace
{
    Task Process(IEnumerable<FileInfo> mp3Files);
    FileInfo[] GetAudioRecordings();
}