using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Spectre.Console;
using Whisper.net;
using NAudio.Wave;

namespace WhisperPrototype;

public class Workspace(AppSettings appConfig, FeatureToggles featureToggles, MenuEngine menuEngine) : IWorkspace
{
    private string? ModelPath { get; set; }
    private string? ModelName { get; set; }

    private bool IsInitialised => !string.IsNullOrEmpty(ModelPath) && !string.IsNullOrEmpty(ModelName);

    private AppSettings Config { get; init; } = appConfig;
    
    private IAudioCaptureService? _audioCaptureService;
    
    /// <summary>
    /// Lazily initializes and returns the appropriate IAudioCaptureService for the current platform
    /// </summary>
    private IAudioCaptureService? AudioCaptureService
    {
        get
        {
            if (_audioCaptureService != null)
                return _audioCaptureService;
                
            // Initialize the appropriate audio capture service based on the platform
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                _audioCaptureService = new WindowsNAudioAudioCaptureService();
                AnsiConsole.MarkupLine("[blue]Selected WindowsNAudioAudioCaptureService.[/]");
            }
            else if (IsWsl())
            {
                _audioCaptureService = new WslPulseAudioCaptureService();
                AnsiConsole.MarkupLine("[blue]Selected WslPulseAudioCaptureService for WSL.[/]");
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                _audioCaptureService = new BareMetalAlsaAudioCaptureService();
                AnsiConsole.MarkupLine("[blue]Selected BareMetalAlsaAudioCaptureService for Linux.[/]");
            }
            
            if (_audioCaptureService == null)
            {
                AnsiConsole.MarkupLine(
                    "[red]Error: Could not determine or initialize an audio capture service for the current OS.[/]");
            }
            
            return _audioCaptureService;
        }
    }

    /// <summary>
    ///     Event for when a segment of text has been transcribed
    /// </summary>
    public event EventHandler<TranscribedDataEventArgs>? TranscribedDataAvailable;

    public async Task<bool> SelectModelAsync()
    {
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

        var selectedModelFile = await menuEngine.PromptChooseSingleFile(
            modelFiles,
            "Please select a [green]model file[/] to use:",
            f => f.Name
        );

        if (selectedModelFile == null)
        {
            AnsiConsole.MarkupLine("[red]Error:[/] No model file was selected. Application cannot continue.[/]");
            return false;
        }

        LoadModel(selectedModelFile);
        return true;
    }

    public void LoadModel(FileInfo selectedModelFile)
    {
        var tempModelPath = selectedModelFile.FullName;
        var tempModelName = selectedModelFile.Name;
        AnsiConsole.WriteLine($"Selected model: {tempModelPath}");

        if (!File.Exists(tempModelPath))
        {
            AnsiConsole.MarkupLine($"[red]Error:[/] Model file not found at {tempModelPath}");
            AnsiConsole.MarkupLine(
                $"[red]Please ensure '{Path.Combine("Models", tempModelName)}' is in the application's output directory " +
                $"(e.g., bin/Debug/net9.0/Models/)[/] - [yellow]which is soon to change, FYI.[/]");
            return; // Exit the application
        }

        AnsiConsole.WriteLine($"Found model file: {tempModelPath}");

        if (!Directory.Exists(Config.InputDirectory))
        {
            AnsiConsole.WriteLine($"Creating input directory: {Config.InputDirectory}");
            Directory.CreateDirectory(Config.InputDirectory!);
            
            // Exit because the input directory didn't previously exist; now add files and re-run.
            AnsiConsole.WriteLine("Please place your MP3 files in this directory and run the application again.");
            return;
        }

        AnsiConsole.WriteLine($"Looking for MP3 files in: {Config.InputDirectory}");

        // Changes IsInitialised { false => true } so do it last, once finalised.
        ModelPath = tempModelPath;
        ModelName = tempModelName;
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

                IAudioConverter converter = new FFmpegWrapper();
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

                var audioDuration = FFmpegWrapper.GetAudioDuration(tempWavFilePath);
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

    public async Task StartLiveTranscriptionAsync()
    {
        if (!IsInitialised)
        {
            throw new Exception($"Please initialize the workspace with {nameof(LoadModel)}() before processing.");
        }

        // Subscribe to the new event for handling transcribed data
        this.TranscribedDataAvailable += HandleTranscribedDataOutput; // Changed handler name for clarity

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

        // Get the lazily-initialized audio capture service
        var audioCaptureService = AudioCaptureService;
        if (audioCaptureService == null)
        {
            AnsiConsole.MarkupLine(
                "[red]Error: Could not determine or initialize an audio capture service for the current OS.[/]");
            return;
        }
        
        var desiredFormat = new WaveFormat(16000, 16, 1); // PCM, 16kHz, 16-bit, Mono

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

        // Configuration for audio chunking
        const float
            desiredChunkDurationSeconds =
                2.0f; // Duration of audio to buffer before processing. Tune for responsiveness vs. transcription quality.
        const int bytesPerSample = 2; // 16-bit audio
        const int channels = 1; // Mono audio
        const int sampleRate = 16000; // 16kHz
        const int bytesPerSecond = sampleRate * bytesPerSample * channels;
        const int processThresholdInBytes = (int)(bytesPerSecond * desiredChunkDurationSeconds);

        var lastProcessTime = DateTime.UtcNow; // Kept for potential future duration-based processing trigger

        // Task 2.4: Implement Real-time Audio Processing Loop
        audioCaptureService.AudioDataAvailable += async (sender, args) =>
        {
            if (args.BytesRecorded > 0)
            {
                await audioBuffer.WriteAsync(args.Buffer, 0, args.BytesRecorded);
                if (featureToggles.LogAudioDataReceivedMessages) // Check the flag here
                {
                    AnsiConsole.MarkupLine(
                        $"[grey]Live: Received {args.BytesRecorded} audio bytes. Buffer size: {audioBuffer.Length} bytes.[/]");
                }
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
                    if (featureToggles.LogProcessingChunkMessages)
                        AnsiConsole.MarkupLine($"[cyan]Processing audio chunk of {audioBuffer.Length} bytes...[/]");
                    audioBuffer.Seek(0, SeekOrigin.Begin); // Reset stream position for reading

                    var tempBuffer = new byte[audioBuffer.Length];
                    await audioBuffer.ReadAsync(tempBuffer, 0,
                        tempBuffer.Length);

                    // Clear the main buffer after copying its content
                    audioBuffer.SetLength(0);
                    audioBuffer.Seek(0, SeekOrigin.Begin);

                    // Convert byte[] (16-bit PCM) to float[] for Whisper.net
                    int numSamples = tempBuffer.Length / bytesPerSample;
                    float[] floatSamples = new float[numSamples];

                    for (int i = 0; i < numSamples; i++)
                    {
                        short pcmSample = BitConverter.ToInt16(tempBuffer, i * bytesPerSample);
                        floatSamples[i] = pcmSample / 32768.0f; // Normalize to [-1.0, 1.0]
                    }

                    try
                    {
                        if (featureToggles.EnableDiagnosticLogging)
                            AnsiConsole.MarkupLine("[yellow]DEBUG: About to call processor.ProcessAsync...[/]");
                        bool segmentReceived = false;
                        // Call ProcessAsync with the float array of samples
                        await foreach (var segment in processor.ProcessAsync(floatSamples))
                        {
                            segmentReceived = true;
                            if (featureToggles.EnableDiagnosticLogging)
                            {
                                var segmentTextForLog = segment.Text ?? "<null_or_empty>";
                                AnsiConsole.MarkupLine(
                                    $"[yellow]DEBUG: Segment received from Whisper: '{Markup.Escape(segmentTextForLog)}' (Length: {segmentTextForLog.Length})[/]");
                            }

                            if (!string.IsNullOrWhiteSpace(segment.Text))
                            {
                                var segmentText = Markup.Escape(segment.Text); // Escape for transcriptionBuffer too
                                transcriptionBuffer.Append(segmentText);
                                if (featureToggles.EnableDiagnosticLogging)
                                    AnsiConsole.MarkupLine(
                                        "[yellow]DEBUG: Invoking TranscribedDataAvailable event...[/]");
                                TranscribedDataAvailable?.Invoke(this, new TranscribedDataEventArgs(segment.Text));
                            }
                            else
                            {
                                if (featureToggles.EnableDiagnosticLogging)
                                    AnsiConsole.MarkupLine(
                                        "[yellow]DEBUG: Segment text is null or whitespace, not invoking event.[/]");
                            }
                        }

                        if (!segmentReceived && featureToggles.EnableDiagnosticLogging)
                        {
                            AnsiConsole.MarkupLine(
                                "[yellow]DEBUG: processor.ProcessAsync completed without yielding any segments.[/]");
                        }
                    }
                    catch (Exception ex)
                    {
                        AnsiConsole.MarkupLine($"[red]Error during transcription: {Markup.Escape(ex.Message)}[/]");
                        // Optionally, decide if we should stop or continue
                    }

                    lastProcessTime =
                        DateTime.UtcNow;
                    // AnsiConsole.WriteLine(); // REMOVE this to keep output on the same line
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
            // Unsubscribe from the event when done
            this.TranscribedDataAvailable -= HandleTranscribedDataOutput;

            AnsiConsole.MarkupLine("[cyan]Stopping audio capture...[/]");
            // Ensure audioCaptureService is not null before calling methods on it if it's nullable
            if (audioCaptureService != null)
            {
                await audioCaptureService.StopCaptureAsync();
                await audioCaptureService.DisposeAsync();
            }

            AnsiConsole.MarkupLine("[green]Audio capture stopped and service disposed.[/]");

            // Add a newline here to separate the continuous transcription from the final summary
            AnsiConsole.WriteLine();

            AnsiConsole.MarkupLine("[bold green]Live Transcription Complete:[/]");
            AnsiConsole.WriteLine(transcriptionBuffer.ToString());

            // Optionally save the full transcription to a file
            // TODO: Stream it to a file as transcribing, perhaps in batches. Make sure it disposes gracefully and
            //       writes it's last buffer before the program stops. (This TODO is still valid for future work)
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

    /// <summary>
    ///     Handler for the <see cref="TranscribedDataAvailable"/> event
    /// </summary>
    private void HandleTranscribedDataOutput(object? sender, TranscribedDataEventArgs e)
    {
        if (featureToggles.EnableDiagnosticLogging)
            AnsiConsole.MarkupLine(
                $"[yellow]DEBUG: HandleTranscribedDataOutput called with text: '{Markup.Escape(e.TranscribedText)}'[/]");
        
        // Continuous output without newlines for each segment
        AnsiConsole.Write(Markup.Escape(e.TranscribedText));
    }
}