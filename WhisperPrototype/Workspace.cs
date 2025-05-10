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
    // const string InputDirectory = "/home/james/src/WhisperSpeechToTextDotnet/WhisperPrototype/Inputs";

    // The directory where the text output files will be saved.
    // We'll save them in the same directory as the input file for simplicity here.
    // const string OutputDirectory = "/home/james/src/WhisperSpeechToTextDotnet/WhisperPrototype/Outputs";

    /// <summary>
    ///     Set in constructor
    /// </summary>
    private string ModelPath { get; }
    private string ModelName { get; }
    private AppSettings Config { get; }

    public Workspace(AppSettings appConfig)
    {
        Config = appConfig;
        Console.WriteLine("Preparing and checking this device before attempting conversion.");

        var modelDirectory = Path.Combine(AppContext.BaseDirectory, "Models");

        if (!Directory.Exists(modelDirectory))
        {
            AnsiConsole.MarkupLine("[red]Error:[/] Model directory not found: [yellow]" + modelDirectory + "[/]");
            throw new DirectoryNotFoundException($"Model directory not found: {modelDirectory}");
        }

        var modelFiles = Directory.GetFiles(modelDirectory)
                                  .Select(f => new FileInfo(f))
                                  .Where(f => (f.Attributes & FileAttributes.Hidden) == 0)
                                  .OrderBy(f => f.Name)
                                  .ToList();

        if (modelFiles.Count == 0)
        {
            AnsiConsole.MarkupLine("[red]Error:[/] No model files found in: [yellow]" + modelDirectory + "[/]");
            throw new FileNotFoundException($"No model files found in {modelDirectory}");
        }

        var menuEngine = new MenuEngine(); // Instantiate MenuEngine
        var selectedModelFileTask = menuEngine.PromptChooseSingleFile(
            modelFiles,
            "Please select a [green]model file[/] to use:",
            f => f.Name
        );
        // It's a console app, so we can block for this initial setup.
        // Consider if async all the way up is needed for your app structure.
        var selectedModelFile = selectedModelFileTask.GetAwaiter().GetResult();

        if (selectedModelFile == null)
        {
            AnsiConsole.MarkupLine("[red]Error:[/] No model file was selected. Application cannot continue.[/]");
            // A more robust application might throw an exception or have a specific exit strategy.
            Environment.Exit(1); // Exit if no model selected
            return; // Keep compiler happy about selectedModelFile potentially being null later
        }

        ModelPath = selectedModelFile.FullName;
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

        if (!Directory.Exists(Config.InputDirectory))
        {
            Console.WriteLine($"Creating input directory: {Config.InputDirectory}");
            Directory.CreateDirectory(Config.InputDirectory!);
            Console.WriteLine("Please place your MP3 files in this directory and run the application again.");
            return; // Exit if the input directory doesn't exist yet
        }
        else
        {
            Console.WriteLine($"Looking for MP3 files in: {Config.InputDirectory}");
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
                double.TryParse(
                    durationStr,
                    System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture, 
                    out var durationSeconds))
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


    public async Task Process(IEnumerable<FileInfo> mp3Files)
    {
        // Create Whisper factory from the model path
        using var factory = WhisperFactory.FromPath(ModelPath!);

        // Configure the processor - we'll assume English for now for better performance
        // You can remove .WithLanguage("en") to enable language detection, but it's slower.
        // .WithLanguage("auto") also enables detection.
        await using var processor = factory.CreateBuilder()
            .WithLanguage("en") // Specify English for faster processing if known
            .Build();

        // Process each MP3 file (now FileInfo objects)
        foreach (var mp3FileInfo in mp3Files) // mp3Files is now IEnumerable<FileInfo>
        {
            var mp3FilePath = mp3FileInfo.FullName; // Get the full path from FileInfo
            var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(mp3FilePath);

            if (!Directory.Exists(Config.OutputDirectory))
            {
                Directory.CreateDirectory(Config.OutputDirectory!);
            }

            var outputTxtFilePath = Path.Combine(Config.OutputDirectory!, $"{fileNameWithoutExtension}_{ModelName}.txt");
            var tempWavFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.wav");

            AnsiConsole.MarkupLine($"\nProcessing: [blue]{Markup.Escape(mp3FileInfo.Name)}[/]"); // Use Name for display, ESCAPED

            if (File.Exists(outputTxtFilePath))
            {
                AnsiConsole.MarkupLine($"Output file already exists: [yellow]{Markup.Escape(outputTxtFilePath)}[/]."); // ESCAPED

                var overwrite = AnsiConsole.Confirm("Do you want to overwrite it?", defaultValue: false);

                if (overwrite)
                {
                    AnsiConsole.MarkupLine($"Deleting existing file: [yellow]{Markup.Escape(outputTxtFilePath)}[/]"); // ESCAPED
                    File.Delete(outputTxtFilePath);
                }
                else
                {
                    AnsiConsole.MarkupLine($"Skipping processing for: [blue]{Markup.Escape(mp3FileInfo.Name)}[/]"); // ESCAPED
                    continue;
                }
            }

            try
            {
                AnsiConsole.MarkupLine("Converting MP3 to WAV using ffmpeg...");

                IAudioConverter converter = new AudioConverter();
                converter.ToWav(mp3FilePath, tempWavFilePath);
                AnsiConsole.MarkupLine("Conversion complete.");

                AnsiConsole.MarkupLine("Starting transcription...");

                if (!File.Exists(tempWavFilePath))
                {
                     throw new FileNotFoundException($"ffmpeg failed to create the temporary WAV file: {tempWavFilePath}");
                }

                var sw = new Stopwatch();
                sw.Start();

                await using var audioStream = File.OpenRead(tempWavFilePath);
                var transcription = new StringBuilder();

                await foreach (var segment in processor.ProcessAsync(audioStream))
                {
                    transcription.Append(segment.Text);
                }
                sw.Stop();

                var audioDuration = GetAudioDuration(tempWavFilePath);
                if (audioDuration == null)
                {
                    AnsiConsole.MarkupLine("[red]Error:[/] Could not determine audio duration for calculations.");
                }
                else
                {
                    var ratio = sw.Elapsed.TotalSeconds / audioDuration.Value.TotalSeconds;
                    var audioDurationText = audioDuration.Value.TotalSeconds.ToString("F2");
                    var elapsedText = sw.Elapsed.TotalSeconds.ToString("F2");
                    var ratioText = ratio.ToString("F2");
                    var speedColor = ratio < 1 ? "green" : "red";
                    
                    // Construct the speed details part with its own markup, e.g., "[bold green]0.75x speed[/]"
                    var speedDetailsMarkup = $"[bold {speedColor}]{ratioText}x speed[/]";

                    AnsiConsole.MarkupLine(
                        $"Transcription of [green]{audioDurationText}s[/] audio completed in [yellow]{elapsedText}s[/] ({speedDetailsMarkup})."
                    );
                }

                await File.WriteAllTextAsync(outputTxtFilePath, transcription.ToString());
                AnsiConsole.MarkupLine($"Transcription saved to: [yellow]{Markup.Escape(outputTxtFilePath)}[/]"); // ESCAPED
                AnsiConsole.WriteLine(transcription.ToString());
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine($"[red]An error occurred while processing {Markup.Escape(mp3FileInfo.Name)}: {Markup.Escape(ex.Message)}[/]"); // ESCAPED
            }
            finally
            {
                if (File.Exists(tempWavFilePath))
                {
                    try
                    {
                        File.Delete(tempWavFilePath);
                    }
                    catch (Exception cleanEx)
                    {
                        AnsiConsole.MarkupLine($"[yellow]Warning:[/] Could not delete temporary WAV file {tempWavFilePath}: {cleanEx.Message}");
                    }
                }
            }
        }
    }

    public FileInfo[] GetAudioRecordings() // Renamed from GetMp3Files
    {
        if (Config.InputDirectory == null || !Directory.Exists(Config.InputDirectory))
        {
            AnsiConsole.MarkupLine($"[red]Error:[/] Input directory '{Markup.Escape(Config.InputDirectory ?? "<null>")}' not found or not configured.");
            return [];
        }

        // Still looking for .mp3 files specifically, but method name is more generic for future expansion.
        var audioFilePaths = Directory.GetFiles(Config.InputDirectory, "*.mp3"); 
        var audioFileInfos = audioFilePaths.Select(path => new FileInfo(path)).ToList();

        if (!audioFileInfos.Any())
        {
            AnsiConsole.MarkupLine($"[yellow]No audio recordings (*.mp3) found in {Markup.Escape(Config.InputDirectory)}.[/]"); // Updated message
            AnsiConsole.MarkupLine("Please place your audio recording files in this directory and run the application again."); // Updated message
            return [];
        }

        AnsiConsole.MarkupLine($"Found [green]{audioFileInfos.Count}[/] audio recording(s) (*.mp3) to process."); // Updated message
        return audioFileInfos.ToArray();
    }
}