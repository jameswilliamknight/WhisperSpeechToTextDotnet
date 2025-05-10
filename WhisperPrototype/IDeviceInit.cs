namespace WhisperPrototype;

public interface IWorkspace
{
    Task Process(IEnumerable<string> mp3Files);
    string[] GetMp3Files();
}