namespace WhisperPrototype;

public interface IAudioConverter
{
    void ToWav(string inputPath, string wavPath);
}