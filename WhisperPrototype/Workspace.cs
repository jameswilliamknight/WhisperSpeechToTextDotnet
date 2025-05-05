using System.Diagnostics;
using System.Text;
using Spectre.Console;
using Whisper.net;

namespace WhisperPrototype;

public class Workspace : IWorkspace
{
    // Google Drive, Test recordings for longitudinally benchmarking, i.e. same audio being put through various tests.
    // private/media/Recordings/Audio-Test

    // Syncthing, voice recordings from mobile phone.
    // Voice Recordings/Voice Journal

    // The directory where your MP3 files will be placed.
    // This path is relative to the environment where the app runs (WSL or Pi).
    // TODO: remove specific username 'james'.
    const string InputDirectory = "/home/james/src/WhisperSpeechToTextDotnet/WhisperPrototype/Inputs";

    // The directory where the text output files will be saved.
    // We'll save them in the same directory as the input file for simplicity here.
    // TODO: remove specific username 'james'.
    const string OutputDirectory = "/home/james/src/WhisperSpeechToTextDotnet/WhisperPrototype/Outputs";
    
    /// <summary>
    ///     Set in constructor
    /// </summary>
    private string ModelPath { get; }
    private string ModelName { get; }
    
    public Workspace()
    {
        Console.WriteLine("Preparing and checking this device before attempting conversion.");

        var modelDirectory = Path.Combine(AppContext.BaseDirectory, "Models"); // Get path to the 'Models' folder

        if (!Directory.Exists(modelDirectory))
        {
            AnsiConsole.MarkupLine("[red]Error:[/] Model directory not found: [yellow]" + modelDirectory + "[/]");
            throw new DirectoryNotFoundException($"Model directory not found: {modelDirectory}");
        }

        // Get all files in the model directory that are not hidden (if applicable) and sort them
        var modelFiles = Directory.GetFiles(modelDirectory)
                                  .Select(f => new FileInfo(f)) // Use FileInfo to easily check attributes if needed
                                  .Where(f => (f.Attributes & FileAttributes.Hidden) == 0) // Basic check for hidden files
                                  .OrderBy(f => f.Name) // Sort alphabetically by filename
                                  .ToList();


        if (modelFiles.Count == 0)
        {
            AnsiConsole.MarkupLine("[red]Error:[/] No model files found in: [yellow]" + modelDirectory + "[/]");
            throw new FileNotFoundException($"No model files found in {modelDirectory}");
        }

        // Present the model files to the user using Spectre.Console single choice picker
        var selectedModelFile = AnsiConsole.Prompt(
            new SelectionPrompt<FileInfo>()
                .Title("Please select a [green]model file[/] to use:")
                .PageSize(10) // Show up to 10 options at a time
                .MoreChoicesText("[grey](Move up and down to reveal more models)[/]")
                // Use HighlightStyle to apply markup to the selected choice
                .HighlightStyle("green") // Highlight the selected choice in green
                .AddChoices(modelFiles)
                .UseConverter(f => f.Name) // Display only the filename
        );
        
        ModelPath = selectedModelFile.FullName; // Set modelPath to the full path of the selected file
        ModelName = selectedModelFile.Name;
        Console.WriteLine($"Selected model: {ModelPath}");

        if (!File.Exists(ModelPath))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            // Corrected error message to reflect the actual path being checked
            Console.WriteLine($"Error: Model file not found at {ModelPath}");
            Console.WriteLine(
                $"Please ensure '{Path.Combine("Models", ModelName)}' is in the application's output directory (e.g., bin/Debug/net9.0/Models/).");
            Console.ResetColor();
            return; // Exit the application
        }
        else
        {
            Console.WriteLine($"Found model file: {ModelPath}");
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
    }


    /// <summary>
    /// Gets the duration of an audio/video file using ffmpeg.
    ///     TODO: put in <see cref="AudioConverter"/>, return converted audio with rich metadata including duration.
    /// </summary>
    /// <summary>
    /// Gets audio duration via ffprobe (minimal, no error handling).
    /// </summary>
      private static TimeSpan? GetAudioDuration(string filePath)
    {
        // Arguments to get only the duration value
        var ffprobeArgs = $"-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"{filePath}\"";
        var startInfo = new ProcessStartInfo("ffprobe", ffprobeArgs)
        {
            RedirectStandardOutput = true, // Need this for the duration value
            RedirectStandardError = true,  // Need this to capture potential errors
            UseShellExecute = false,
            CreateNoWindow = true
        };

        string durationStr = null; // Store the output here
        string errorOutput = null; // Store errors here

        try // Add minimal try-catch for process start issues
        {
            using var process = new Process { StartInfo = startInfo };
            process.Start();

            // Read streams *once*
            durationStr = process.StandardOutput.ReadToEnd();
            errorOutput = process.StandardError.ReadToEnd();

            process.WaitForExit();

            // Optional: Keep debug output if needed
            // Console.WriteLine($"Duration Detection (ffprobe stdout): {durationStr}");
            // Console.WriteLine($"Duration Detection (ffprobe stderr): {errorOutput}");

            // Directly parse the output string
            if (!string.IsNullOrWhiteSpace(durationStr) &&
                double.TryParse(durationStr, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double durationSeconds))
            {
                return TimeSpan.FromSeconds(durationSeconds);
            }
            else if (!string.IsNullOrWhiteSpace(errorOutput)) // Log if there was an error message
            {
                 Console.WriteLine($"ffprobe stderr (duration check): {errorOutput}");
            }
        }
        catch (Exception ex)
        {
             Console.WriteLine($"Error running ffprobe for duration: {ex.Message}");
        }


        return null; // Return null if parsing fails or process error
    }

    
    public async Task Process(string[] mp3Files)
    {
        // Create Whisper factory from the model path
        using var factory = WhisperFactory.FromPath(ModelPath);

        // Configure the processor - we'll assume English for now for better performance
        // You can remove .WithLanguage("en") to enable language detection, but it's slower.
        // .WithLanguage("auto") also enables detection.
        await using var processor = factory.CreateBuilder()
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
            
            var outputTxtFilePath = Path.Combine(OutputDirectory, $"{fileNameWithoutExtension}_{ModelName}.txt");
            var tempWavFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.wav"); // Use a temp path for WAV

            Console.WriteLine($"\nProcessing: {mp3FilePath}");

            if (File.Exists(outputTxtFilePath))
            {
                Console.WriteLine($"Output file already exists: {outputTxtFilePath}.");

                // Ask the user if they want to overwrite the file using Spectre.Console
                var overwrite = AnsiConsole.Confirm("Do you want to overwrite it?", defaultValue: false);

                if (overwrite)
                {
                    Console.WriteLine($"Deleting existing file: {outputTxtFilePath}");
                    File.Delete(outputTxtFilePath);
                }
                else
                {
                    Console.WriteLine($"Skipping processing for: {mp3FilePath}");
                    continue; // Skip if the user doesn't want to overwrite
                }
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

                var sw = new Stopwatch();
                sw.Start();
                
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
                sw.Stop();
                
                var audioDuration = GetAudioDuration(tempWavFilePath);
                
                Console.WriteLine("Transcription of {0} seconds of audio completed in {1} seconds ({2} ratio).", audioDuration.Value.TotalSeconds, sw.Elapsed.TotalSeconds,
                    (audioDuration.Value.Ticks / sw.Elapsed.Ticks));

                // Calculate ratio using doubles for floating-point division
                double ratio = sw.Elapsed.TotalSeconds / audioDuration.Value.TotalSeconds;

                // Use string interpolation with format specifiers (F2 = Fixed-point, 2 decimals)
                Console.WriteLine(
                    $"Transcription of {audioDuration.Value.TotalSeconds:F2} seconds of audio completed in {sw.Elapsed.TotalSeconds:F2} seconds ({ratio:F2} ratio)."
                );

                // --- Optional: Add the speed comparison back if you liked it ---
                string speedComparison;
                if (ratio < 1)
                {
                    speedComparison = $"([bold green]{1/ratio:F2}x faster[/])";
                }
                else if (ratio > 1)
                {
                    speedComparison = $"([bold red]{1/ratio:F2}x speed[/])";
                }
                else
                {
                    speedComparison = "(Realtime)";
                }
                AnsiConsole.MarkupLine($"Processing took [yellow]{ratio:F2}[/] times the audio duration {speedComparison}.");
                // --- End Optional ---

                
                // Save the transcription to a text file
                await File.WriteAllTextAsync(outputTxtFilePath, transcription.ToString());
                Console.WriteLine($"Transcription saved to: {outputTxtFilePath}");
                AnsiConsole.WriteLine(transcription.ToString());
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
    }

    public string[] GetMp3Files()
    {
        var mp3Files = Directory.GetFiles(InputDirectory, "*.mp3");
        
        if (mp3Files.Length == 0)
        {
            Console.WriteLine($"No MP3 files found in {InputDirectory}.");
            Console.WriteLine("Please place your MP3 files in this directory and run the application again.");
            return [];
        }
        
        Console.WriteLine($"Found {mp3Files.Length} MP3 file(s) to process.");
        
        return mp3Files;
    }
}