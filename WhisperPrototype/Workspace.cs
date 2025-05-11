using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Spectre.Console;
using Whisper.net;
using NAudio.Wave;

namespace WhisperPrototype;

public class Workspace(AppSettings appConfig) : IWorkspace
{
    private string? ModelPath { get; set; }
    private string? ModelName { get; set; }

    public bool IsInitialised => !string.IsNullOrEmpty(ModelPath) && !string.IsNullOrEmpty(ModelName);
    
    private AppSettings Config { get; init; } = appConfig;

    public void LoadModel(FileInfo selectedModelFile)
    {
        ModelPath = selectedModelFile.FullName;
        ModelName = selectedModelFile.Name;
        AnsiConsole.WriteLine($"Selected model: {ModelPath}");

        if (!File.Exists(ModelPath))
        {
            AnsiConsole.MarkupLine($"[red]Error:[/] Model file not found at {ModelPath}");
            AnsiConsole.MarkupLine(
                $"[red]Please ensure '{Path.Combine("Models", ModelName)}' is in the application's output directory (e.g., bin/Debug/net9.0/Models/).[/]");
            return; // Exit the application
        }
        else
        {
            AnsiConsole.WriteLine($"Found model file: {ModelPath}");
        }

        if (!Directory.Exists(Config.InputDirectory))
        {
            AnsiConsole.WriteLine($"Creating input directory: {Config.InputDirectory}");
            Directory.CreateDirectory(Config.InputDirectory!);
            AnsiConsole.WriteLine("Please place your MP3 files in this directory and run the application again.");
            return; // Exit if the input directory doesn't exist yet
        }
        else
        {
            AnsiConsole.WriteLine($"Looking for MP3 files in: {Config.InputDirectory}");
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
        var ffprobeArgs =
            $"-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"{filePath}\"";
        var startInfo = new ProcessStartInfo("ffprobe", ffprobeArgs)
        {
            RedirectStandardOutput = true, // Need this for the duration value
            RedirectStandardError = true, // Need this to capture potential errors
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
            // AnsiConsole.WriteLine($"Duration Detection (ffprobe stdout): {durationStr}");
            // AnsiConsole.WriteLine($"Duration Detection (ffprobe stderr): {errorOutput}");

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
                AnsiConsole.MarkupLine(
                    $"[yellow]ffprobe stderr (duration check): {Markup.Escape(errorOutput)}[/]"); // Use MarkupLine and Escape
            }
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine(
                $"[red]Error running ffprobe for duration: {Markup.Escape(ex.Message)}[/]"); // Use MarkupLine and Escape
        }


        return null; // Return null if parsing fails or process error
    }

    private static bool IsWsl()
    {
        // Check for common WSL environment variables
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WSL_DISTRO_NAME")) ||
            !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WSL_INTEROP")) ||
            !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WSLENV")))
        {
            return true;
        }

        // Fallback: Check /proc/version for WSL indicators (Linux specific)
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            try
            {
                if (File.Exists("/proc/version"))
                {
                    var versionInfo = File.ReadAllText("/proc/version");
                    if (versionInfo.Contains("Microsoft", StringComparison.OrdinalIgnoreCase) ||
                        versionInfo.Contains("WSL", StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
            }
            catch (Exception ex)
            {
                // Ignore errors reading /proc/version, e.g. permission denied, and proceed to default Linux behavior
                AnsiConsole.MarkupLine($"[grey]IsWsl: Error checking /proc/version: {Markup.Escape(ex.Message)}[/]");
            }
        }

        return false;
    }

    public async Task Process(IEnumerable<FileInfo> audioFiles)
    {
        if (!IsInitialised)
        {
            throw new Exception("Please initialize the workspace before processing.");
        }
        
        // Create Whisper factory from the model path
        using var factory = WhisperFactory.FromPath(ModelPath!);

        // Configure the processor - we'll assume English for now for better performance
        // You can remove .WithLanguage("en") to enable language detection, but it's slower.
        // .WithLanguage("auto") also enables detection.
        await using var processor = factory.CreateBuilder()
            .WithLanguage("en") // Specify English for faster processing if known
            .Build();

        foreach (var audioFileInfo in audioFiles)
        {
            var audioFilePath = audioFileInfo.FullName;
            var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(audioFilePath);

            if (!Directory.Exists(Config.OutputDirectory))
            {
                Directory.CreateDirectory(Config.OutputDirectory!);
            }

            var outputTxtFilePath =
                Path.Combine(Config.OutputDirectory!, $"{fileNameWithoutExtension}_{ModelName}.txt");
            var tempWavFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.wav");

            AnsiConsole.MarkupLine($"\nProcessing: [blue]{Markup.Escape(audioFileInfo.Name)}[/]");

            if (File.Exists(outputTxtFilePath))
            {
                AnsiConsole.MarkupLine($"Output file already exists: [yellow]{Markup.Escape(outputTxtFilePath)}[/].");

                var overwrite = await AnsiConsole.ConfirmAsync("Do you want to overwrite it?", defaultValue: false);

                if (overwrite)
                {
                    AnsiConsole.MarkupLine($"Deleting existing file: [yellow]{Markup.Escape(outputTxtFilePath)}[/]");
                    File.Delete(outputTxtFilePath);
                }
                else
                {
                    AnsiConsole.MarkupLine($"Skipping processing for: [blue]{Markup.Escape(audioFileInfo.Name)}[/]");
                    continue;
                }
            }

            try
            {
                AnsiConsole.MarkupLine("Converting MP3 to WAV using ffmpeg...");

                IAudioConverter converter = new AudioConverter();
                converter.ToWav(audioFilePath, tempWavFilePath);
                AnsiConsole.MarkupLine("Conversion complete.");

                AnsiConsole.MarkupLine("Starting transcription...");

                if (!File.Exists(tempWavFilePath))
                {
                    throw new FileNotFoundException(
                        $"ffmpeg failed to create the temporary WAV file: {tempWavFilePath}");
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
                AnsiConsole.MarkupLine($"Transcription saved to: [yellow]{Markup.Escape(outputTxtFilePath)}[/]");
                AnsiConsole.WriteLine(transcription.ToString());
                AnsiConsole.MarkupLine($"--- END OF TRANSCRIPTION FOR {Markup.Escape(audioFileInfo.Name)} ---");
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine(
                    $"[red]Error processing {Markup.Escape(audioFileInfo.Name)}:[/] {Markup.Escape(ex.Message)}");
            }
            finally
            {
                if (File.Exists(tempWavFilePath))
                {
                    File.Delete(tempWavFilePath);
                }
            }
        }

        AnsiConsole.MarkupLine("\nAll files processed.");
    }

    public async Task StartLiveTranscriptionAsync()
    {
        if (!IsInitialised)
        {
            throw new Exception("Please initialize the workspace before processing.");
        }
        
        AnsiConsole.MarkupLine("[cyan]Starting live transcription...[/]");

        // Task 2.3: Initialise Whisper.net for Streaming
        AnsiConsole.MarkupLine("[grey]Initializing Whisper.net factory and processor...[/]");

        using var whisperFactory = WhisperFactory.FromPath(ModelPath!);

        await using var processor = whisperFactory.CreateBuilder()
            // Defaulting to English ("en").
            // For automatic language detection, use .WithLanguage("auto") - this may be slower.
            .WithLanguage("en")
            .Build();

        AnsiConsole.MarkupLine($"[green]Whisper.net ready with language: en[/]");

        // --- Audio Capture Service Setup (OS-dependent, determined here) ---
        IAudioCaptureService? audioCaptureService = null;
        var desiredFormat = new WaveFormat(16000, 16, 1); // PCM, 16kHz, 16-bit, Mono

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            audioCaptureService = new WindowsNAudioAudioCaptureService();
            AnsiConsole.MarkupLine("[blue]Selected WindowsNAudioAudioCaptureService.[/]");
        }
        else if (IsWsl())
        {
            audioCaptureService = new WslPulseAudioCaptureService();
            AnsiConsole.MarkupLine("[blue]Selected WslPulseAudioCaptureService for WSL.[/]");
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            audioCaptureService = new BareMetalAlsaAudioCaptureService();
            AnsiConsole.MarkupLine("[blue]Selected BareMetalAlsaAudioCaptureService for Linux.[/]");
        }

        if (audioCaptureService == null)
        {
            AnsiConsole.MarkupLine(
                "[red]Error: Could not determine or initialize an audio capture service for the current OS.[/]");
            return;
        }
        // --- End Audio Capture Service Setup ---

        var availableDevices = (await audioCaptureService.GetAvailableDevicesAsync()).ToList();
        if (!availableDevices.Any())
        {
            AnsiConsole.MarkupLine(
                "[yellow]No audio input devices found. Please ensure a microphone is connected and configured.[/]");
            await audioCaptureService.DisposeAsync();
            return;
        }

        AudioInputDevice selectedInputDevice;
        if (availableDevices.Count == 1)
        {
            selectedInputDevice = availableDevices.First();
            AnsiConsole.MarkupLine($"[green]Using default device: {Markup.Escape(selectedInputDevice.Name)}[/]");
        }
        else
        {
            var selectionPrompt = new SelectionPrompt<string>()
                .Title("Multiple audio input devices detected. Please select one:")
                .PageSize(10)
                .AddChoices(availableDevices.Select(d => d.Name));

            var selectedDisplayName = await AnsiConsole.PromptAsync(selectionPrompt);
            selectedInputDevice = availableDevices.First(d => d.Name == selectedDisplayName);
            AnsiConsole.MarkupLine($"[green]Using device: {Markup.Escape(selectedInputDevice.Name)}[/]");
        }

        var audioBuffer = new MemoryStream();
        var transcriptionBuffer = new StringBuilder();
        var stopRequested = false;


        var lastProcessTime =
            DateTime.UtcNow; // TODO: figure out if this is useful, because it's not being read anywhere.
        // Target 5 seconds of audio data before processing. 16kHz, 16-bit mono = 32,000 bytes/sec.
        // So, 5 seconds = 160,000 bytes. This is a starting point.
        const int bytesPerSecond = 16000 * 2 * 1; // SampleRate * (BitsPerSample/8) * Channels
        const int processThresholdInBytes = bytesPerSecond * 5;

        // Task 2.4: Implement Real-time Audio Processing Loop
        audioCaptureService.AudioDataAvailable += async (sender, args) =>
        {
            if (args.BytesRecorded > 0)
            {
                await audioBuffer.WriteAsync(args.Buffer, 0, args.BytesRecorded);
                AnsiConsole.MarkupLine(
                    $"[grey]Live: Received {args.BytesRecorded} audio bytes. Buffer size: {audioBuffer.Length} bytes.[/]");
            }
        };

        try
        {
            await audioCaptureService.StartCaptureAsync(selectedInputDevice.Id, desiredFormat);
            AnsiConsole.MarkupLine("[green]Audio capture started. Press [yellow]ESC[/] to stop.[/]");

            // Main loop for checking buffer and stop condition
            while (!stopRequested)
            {
                if (Console.KeyAvailable)
                {
                    if (Console.ReadKey(true).Key == ConsoleKey.Escape)
                    {
                        stopRequested = true;
                        AnsiConsole.MarkupLine("[yellow]Stop requested by user.[/]");
                        break;
                    }
                }

                if (audioBuffer.Length >= processThresholdInBytes)
                {
                    AnsiConsole.MarkupLine($"[cyan]Processing audio chunk of {audioBuffer.Length} bytes...[/]");
                    audioBuffer.Seek(0, SeekOrigin.Begin); // Reset stream position for reading

                    var tempBuffer = new byte[audioBuffer.Length];
                    await audioBuffer.ReadAsync(tempBuffer, 0,
                        tempBuffer.Length); // TODO: do something with the audio buffer.

                    // Clear the main buffer after copying its content
                    audioBuffer.SetLength(0);
                    audioBuffer.Seek(0, SeekOrigin.Begin);

                    using var segmentStream = new MemoryStream(tempBuffer);

                    try
                    {
                        await foreach (var segment in processor.ProcessAsync(segmentStream))
                        {
                            var segmentText = Markup.Escape(segment.Text);
                            transcriptionBuffer.Append(segmentText);
                            AnsiConsole.Markup(
                                $"[white]{segmentText}[/]"); // Continuous output, consider if new lines are needed
                        }
                    }
                    catch (Exception ex)
                    {
                        AnsiConsole.MarkupLine($"[red]Error during transcription: {Markup.Escape(ex.Message)}[/]");
                        // Optionally, decide if we should stop or continue
                    }

                    lastProcessTime =
                        DateTime.UtcNow; // TODO: figure out if this is useful, because it's not being read anywhere.
                    AnsiConsole.WriteLine(); // Add a newline after processing a chunk for cleaner output
                }

                await Task.Delay(100); // Small delay to prevent tight loop, adjust as needed
            }
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]Error during live transcription: {Markup.Escape(ex.Message)}[/]");
        }
        finally
        {
            AnsiConsole.MarkupLine("[cyan]Stopping audio capture...[/]");
            await audioCaptureService.StopCaptureAsync();
            await audioCaptureService.DisposeAsync();
            AnsiConsole.MarkupLine("[green]Audio capture stopped and service disposed.[/]");
            AnsiConsole.MarkupLine("[bold green]Live Transcription Complete:[/]");
            AnsiConsole.WriteLine(transcriptionBuffer.ToString());

            // Optionally save the full transcription to a file
            // TODO: Stream it to a file as transcribing, perhaps in batches. Make sure it disposes gracefully and
            //       writes it's last buffer before the program stops.
            if (Config.OutputDirectory != null && transcriptionBuffer.Length > 0)
            {
                if (!Directory.Exists(Config.OutputDirectory))
                {
                    Directory.CreateDirectory(Config.OutputDirectory);
                }

                var transcriptPath = Path.Combine(
                    Config.OutputDirectory,
                    $"LiveTranscript_{DateTime.Now:yyyyMMddHHmmss}_{ModelName}.txt");

                try
                {
                    await File.WriteAllTextAsync(transcriptPath, transcriptionBuffer.ToString());
                    AnsiConsole.MarkupLine($"[green]Full transcript saved to: {Markup.Escape(transcriptPath)}[/]");
                }
                catch (Exception ex)
                {
                    AnsiConsole.MarkupLine($"[red]Error saving transcript: {Markup.Escape(ex.Message)}[/]");
                }
            }
        }
    }

    public FileInfo[] GetAudioRecordings()
    {
        if (Config.InputDirectory == null || !Directory.Exists(Config.InputDirectory))
        {
            AnsiConsole.MarkupLine(
                $"[red]Error:[/] Input directory '{Markup.Escape(Config.InputDirectory ?? "<null>")}' not found or not configured.");
            return [];
        }

        // Still looking for .mp3 files specifically, but method name is more generic for future expansion.
        var audioFilePaths = Directory.GetFiles(Config.InputDirectory, "*.mp3");
        var audioFileInfos = audioFilePaths.Select(path => new FileInfo(path)).ToList();

        if (!audioFileInfos.Any())
        {
            AnsiConsole.MarkupLine(
                $"[yellow]No audio recordings (*.mp3) found in {Markup.Escape(Config.InputDirectory)}.[/]");
            AnsiConsole.MarkupLine(
                "Please place your audio recording files in this directory and run the application again.");
            return [];
        }

        AnsiConsole.MarkupLine($"Found [green]{audioFileInfos.Count}[/] audio recording(s) (*.mp3) to process.");
        return audioFileInfos.ToArray();
    }
}