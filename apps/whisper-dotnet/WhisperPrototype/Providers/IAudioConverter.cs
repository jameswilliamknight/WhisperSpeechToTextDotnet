namespace WhisperPrototype.Providers;

public interface IAudioConverter
{
    void ToWav(string inputPath, string wavPath);
}