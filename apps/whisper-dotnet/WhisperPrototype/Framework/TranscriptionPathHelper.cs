using System.IO;

namespace WhisperPrototype.Framework;

/// <summary>
/// Utility methods for transcription file operations
/// </summary>
public static class TranscriptionPathHelper
{
    /// <summary>
    /// Generates a deterministic output file path for a transcription
    /// </summary>
    /// <param name="audioFile">The audio file to be transcribed</param>
    /// <param name="modelName">The model name (will be truncated at first period)</param>
    /// <param name="outputDirectory">The output directory</param>
    /// <returns>Full path to the output .txt file</returns>
    public static string GetTranscriptionOutputPath(
        FileInfo audioFile,
        string modelName,
        string outputDirectory)
    {
        var audioFileNameWithoutExtension = Path.GetFileNameWithoutExtension(audioFile.Name);

        // Replace spaces with underscores in audio filename
        var sanitizedAudioName = audioFileNameWithoutExtension.Replace(" ", "_");

        // Truncate model name at first period (removes .bin and other extensions)
        var truncatedModelName = modelName.Split('.')[0];

        // Use double underscore as separator
        var outputFileName = $"{sanitizedAudioName}__{truncatedModelName}.txt";

        return Path.Combine(outputDirectory, outputFileName);
    }
}
