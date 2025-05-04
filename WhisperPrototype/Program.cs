using System.Diagnostics;
using System.Text;
using Whisper.net;
using WhisperPrototype;

// --- Configuration ---

// The directory where your MP3 files will be placed.
// This path is relative to the environment where the app runs (WSL or Pi).
const string InputDirectory = "/home/james/src/WhisperSpeechToTextDotnet/WhisperPrototype/Inputs";

// The directory where the text output files will be saved.
// We'll save them in the same directory as the input file for simplicity here.
const string OutputDirectory = "/home/james/src/WhisperSpeechToTextDotnet/WhisperPrototype/Outputs";

// The name of the Whisper model file.
// Make sure this file is in the application's output directory's 'Models' subfolder.
const string ModelFileName = "ggml-large-v3.bin";

// --- Main Transcription Logic ---

Console.WriteLine("Starting Whisper Speech to Text Transcription.");

// Find the model file path relative to the application's execution directory
// Account for the 'Models' subfolder created during the build process
var modelDirectory = Path.Combine(AppContext.BaseDirectory, "Models"); // Get path to the 'Models' folder
var modelPath = Path.Combine(modelDirectory, ModelFileName); // Combine 'Models' path with the filename

if (!File.Exists(modelPath))
{
    Console.ForegroundColor = ConsoleColor.Red;
    // Corrected error message to reflect the actual path being checked
    Console.WriteLine($"Error: Model file not found at {modelPath}");
    Console.WriteLine($"Please ensure '{Path.Combine("Models", ModelFileName)}' is in the application's output directory (e.g., bin/Debug/net9.0/Models/).");
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
var mp3Files = Directory.GetFiles(InputDirectory, "*.mp3");

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
using var processor = factory.CreateBuilder()
    .WithLanguage("en") // Specify English for faster processing if known
    .Build();

// Process each MP3 file
foreach (var mp3FilePath in mp3Files)
{
    var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(mp3FilePath);

    if (!Directory.Exists(OutputDirectory))
    {
        Directory.CreateDirectory(OutputDirectory);
    }
    
    var outputTxtFilePath = Path.Combine(OutputDirectory, $"{fileNameWithoutExtension}.txt");
    var tempWavFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.wav"); // Use a temp path for WAV

    Console.WriteLine($"\nProcessing: {mp3FilePath}");

    if (File.Exists(outputTxtFilePath))
    {
        Console.WriteLine($"Output file already exists: {outputTxtFilePath}. Skipping.");
        continue; // Skip if already processed
    }

    try
    {
        Console.WriteLine("Converting MP3 to WAV using ffmpeg...");

        IAudioConverter converter = new AudioConverter();
        converter.ToWav(mp3FilePath, tempWavFilePath);
        Console.WriteLine("Conversion complete.");

        Console.WriteLine("Starting transcription...");

        if (!File.Exists(tempWavFilePath))
        {
             throw new FileNotFoundException($"ffmpeg failed to create the temporary WAV file: {tempWavFilePath}");
        }

        // Read the temporary WAV file
        await using var audioStream = File.OpenRead(tempWavFilePath);

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

