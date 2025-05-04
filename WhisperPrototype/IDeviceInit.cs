namespace WhisperPrototype;

public interface IWorkspace
{
    Task Process(string[] mp3Files);
    string[] GetMp3Files();
}