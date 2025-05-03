using System.Text;
using Whisper.net;
using NAudio.Wave; // Required for MP3 to WAV conversion

// --- Configuration ---

// The directory where your MP3 files will be placed.
// This path is relative to the environment where the app runs (WSL or Pi).
const string InputDirectory = "/home/james/src/WhisperSpeechToTextDotnet/WhisperPrototype/Inputs";

// The directory where the text output files will be saved.
// We'll save them in the same directory as the input file for simplicity here.
const string OutputDirectory = InputDirectory;

// The name of the Whisper model file.
// Make sure this file is in the application's output directory (bin/Debug/net9.0 etc.)
const string ModelFileName = "ggml-large-v3.bin";

// --- Main Transcription Logic ---

Console.WriteLine("Starting Whisper Speech to Text Transcription.");

// Find the model file path relative to the application's execution directory
string modelPath = Path.Combine(AppContext.BaseDirectory, "Models", ModelFileName);

if (!File.Exists(modelPath))
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"Error: Model file not found at {modelPath}");
    Console.WriteLine($"Please ensure '{ModelFileName}' is in the same directory as the executable.");
    Console.ResetColor();
    return; // Exit the application
}
else
{
    Console.WriteLine($"Found model file: {modelPath}");
}

if (!Directory.Exists(InputDirectory))
{
    Console.WriteLine($"Creating input directory: {InputDirectory}");
    Directory.CreateDirectory(InputDirectory);
    Console.WriteLine("Please place your MP3 files in this directory and run the application again.");
    return; // Exit if the input directory doesn't exist yet
}
else
{
    Console.WriteLine($"Looking for MP3 files in: {InputDirectory}");
}

// Get all MP3 files in the input directory
string[] mp3Files = Directory.GetFiles(InputDirectory, "*.mp3");

if (mp3Files.Length == 0)
{
    Console.WriteLine($"No MP3 files found in {InputDirectory}.");
    Console.WriteLine("Please place your MP3 files in this directory and run the application again.");
    return; // Exit if no MP3 files are found
}

Console.WriteLine($"Found {mp3Files.Length} MP3 file(s) to process.");

// Create Whisper factory from the model path
using var factory = WhisperFactory.FromPath(modelPath);

// Configure the processor - we'll assume English for now for better performance
// You can remove .WithLanguage("en") to enable language detection, but it's slower.
// .WithLanguage("auto") also enables detection.
using var processor = factory.CreateBuilder() // Changed from CreateProcessorBuilder()
    .WithLanguage("en") // Specify English for faster processing if known
    .Build();

// Process each MP3 file
foreach (string mp3FilePath in mp3Files)
{
    string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(mp3FilePath);
    string outputTxtFilePath = Path.Combine(OutputDirectory, $"{fileNameWithoutExtension}.txt");
    string tempWavFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.wav"); // Use a temp path for WAV

    Console.WriteLine($"\nProcessing: {mp3FilePath}");

    if (File.Exists(outputTxtFilePath))
    {
        Console.WriteLine($"Output file already exists: {outputTxtFilePath}. Skipping.");
        continue; // Skip if already processed
    }

    try
    {
        Console.WriteLine("Converting MP3 to WAV...");
        ConvertMp3ToWav(mp3FilePath, tempWavFilePath);
        Console.WriteLine("Conversion complete.");

        Console.WriteLine("Starting transcription...");

        // Read the temporary WAV file
        using var audioStream = File.OpenRead(tempWavFilePath);

        var transcription = new StringBuilder();

        // Process the audio stream
        await foreach (var segment in processor.ProcessAsync(audioStream))
        {
            // segment.Start and segment.End provide timestamps (TimeSpan objects)
            // segment.Text is the transcribed text for that segment
            // Console.WriteLine($"[{segment.Start} --> {segment.End}] {segment.Text}");
            transcription.Append(segment.Text); // Append text from each segment
        }

        Console.WriteLine("Transcription complete.");

        // Save the transcription to a text file
        await File.WriteAllTextAsync(outputTxtFilePath, transcription.ToString());
        Console.WriteLine($"Transcription saved to: {outputTxtFilePath}");
    }
    catch (Exception ex)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"An error occurred while processing {mp3FilePath}: {ex.Message}");
        Console.ResetColor();
        // You might want more detailed logging here in a real application
    }
    finally
    {
        // Clean up the temporary WAV file
        if (File.Exists(tempWavFilePath))
        {
            try
            {
                File.Delete(tempWavFilePath);
                // Console.WriteLine($"Cleaned up temporary WAV: {tempWavFilePath}");
            }
            catch (Exception cleanEx)
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine($"Warning: Could not delete temporary WAV file {tempWavFilePath}: {cleanEx.Message}");
                Console.ResetColor();
            }
        }
    }
}

Console.WriteLine("\nAll available MP3 files processed.");
Console.WriteLine("Press Enter to exit.");
Console.ReadLine();


// --- Helper Method for MP3 to WAV Conversion ---

void ConvertMp3ToWav(string mp3Path, string wavPath)
{
    using var reader = new Mp3FileReader(mp3Path);
    // Convert to the desired format: 16kHz, 16-bit, mono
    // Whisper.cpp requires 16kHz, 16-bit, mono PCM
    var outFormat = new WaveFormat(16000, 16, 1);
    using var resampler = new WaveFormatConversionStream(outFormat, reader);
    WaveFileWriter.CreateWaveFile(wavPath, resampler);
}
