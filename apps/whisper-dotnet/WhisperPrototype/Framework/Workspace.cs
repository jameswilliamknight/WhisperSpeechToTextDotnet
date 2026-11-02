using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using NAudio.Wave;
using Spectre.Console;
using Whisper.net;
using WhisperPrototype.Events;
using WhisperPrototype.Framework.TUI;
using WhisperPrototype.Hardware;
using WhisperPrototype.Providers;

namespace WhisperPrototype.Framework;

#pragma warning disable CS9113 // Parameter is unread
public class Workspace(
    AppSettings appConfig,
    FeatureToggles featureToggles,
    MenuEngine menuEngine,  // Injected for DI but not used directly in this class
    IAudioConverter converter,
    ITranscriptionService transcriptionService)
    : IWorkspace
#pragma warning restore CS9113
{
    private string? ModelPath { get; set; }
    public string? ModelName { get; private set; }

    public bool IsModelLoaded => !string.IsNullOrEmpty(ModelPath) && !string.IsNullOrEmpty(ModelName);

    private AppSettings Config { get; init; } = appConfig;

    private IAudioCaptureService? _audioCaptureService;

    private readonly ITranscriptionService _transcriptionService = transcriptionService;

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

    public async Task<bool> SelectModelAsync(bool silent = false)
    {
        // Check if an active model is set in config
        if (!string.IsNullOrEmpty(Config.ActiveModelPath) && File.Exists(Config.ActiveModelPath))
        {
            LoadModel(new FileInfo(Config.ActiveModelPath));
            return true;
        }

        // No active model - show warning only if not silent
        if (!silent)
        {
            AnsiConsole.MarkupLine("[yellow]No active model configured.[/]");
            AnsiConsole.MarkupLine("[grey]Please go to 'Speech Recognition Models' in the main menu to select or download a model.[/]");
            await Task.Delay(3000);
        }
        return false;
    }

    public void LoadModel(FileInfo selectedModelFile)
    {
        var tempModelPath = selectedModelFile.FullName;
        var tempModelName = selectedModelFile.Name;

        if (!File.Exists(tempModelPath))
        {
            AnsiConsole.MarkupLine($"[red]Error:[/] Model file not found at {tempModelPath}");
            AnsiConsole.MarkupLine(
                $"[red]Please ensure '{Path.Combine("Models", tempModelName)}' is in the application's output directory " +
                $"(e.g., bin/Debug/net9.0/Models/)[/] - [yellow]which is soon to change, FYI.[/]");
            return; // Exit the application
        }

        if (!Directory.Exists(Config.InputDirectory))
        {
            AnsiConsole.WriteLine($"Creating input directory: {Config.InputDirectory}");
            Directory.CreateDirectory(Config.InputDirectory!);

            // Exit because the input directory didn't previously exist; now add files and re-run.
            AnsiConsole.WriteLine("Please place your audio files in this directory and run the application again.");
            return;
        }

        // Changes IsInitialised { false => true } so do it last, once finalised.
        ModelPath = tempModelPath;
        ModelName = tempModelName;
    }

    /// <remarks>
    ///     Could create a <tt>AudioTranscribeOptions</tt> record, and pair FileInfo with a set of [Flags] (an enum) of
    ///         options to perform.
    /// 
    ///     First bit, when [Flags] enum value is equal to '1', that marks that we want to chunk the audio by silence.
    ///     Minimum threshold of 15 seconds before considering it something new.
    /// </remarks>
    public async Task TranscribeAll(IEnumerable<FileInfo> audioFiles)
    {
        if (!IsModelLoaded)
        {
            if (!await SelectModelAsync())
            {
                return; // Model could not be loaded
            }
        }

        if (string.IsNullOrEmpty(Config.TempDirectory))
        {
            AnsiConsole.MarkupLine("[red]Error:[/] TempDirectory is not configured in appsettings.json. This is required for storing temporary audio files.");
            throw new InvalidOperationException("TempDirectory is not configured in appsettings.json.");
        }
        if (string.IsNullOrEmpty(Config.OutputDirectory)) // Also ensure OutputDirectory is checked, though it was implicitly used.
        {
            AnsiConsole.MarkupLine("[red]Error:[/] OutputDirectory is not configured in appsettings.json.");
            throw new InvalidOperationException("OutputDirectory is not configured in appsettings.json.");
        }

        // Create Whisper factory from the model path
        using var speechToTextFactory = WhisperFactory.FromPath(ModelPath!);

        // Configure the processor
        await using var processor = speechToTextFactory.CreateBuilder()
            .WithLanguage("en") // Assuming English for now
            .Build();

        // Delegate to the new service
        await _transcriptionService.TranscribeAllFilesAsync(
            audioFiles,
            processor,
            ModelName!,
            Config.OutputDirectory, // OutputDirectory is now also explicitly checked
            converter, // Pass the IAudioConverter instance
            Config.TempDirectory // Pass the configured TempDirectory
        );
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
        var audioFilePathsM4a = Directory.GetFiles(Config.InputDirectory, "*.m4a");
        var audioFilePathsMp3 = Directory.GetFiles(Config.InputDirectory, "*.mp3");
        var audioFilePaths = audioFilePathsM4a.Concat(audioFilePathsMp3);
        var audioFileInfos = audioFilePaths.Select(path => new FileInfo(path)).Where(x => !x.Name.StartsWith(".")).OrderByDescending(x => x.CreationTime).ToList();

        if (!audioFileInfos.Any())
        {
            AnsiConsole.MarkupLine(
                $"[yellow]No audio recordings (*.mp3, *.m4a) found in {Markup.Escape(Config.InputDirectory)}.[/]");
            AnsiConsole.MarkupLine(
                "Please place your audio recording files in this directory and run the application again.");
            return [];
        }

        AnsiConsole.MarkupLine($"Found [green]{audioFileInfos.Count}[/] audio recording(s) to process.");
        return audioFileInfos.ToArray();
    }

    public async Task StartLiveTranscriptionAsync()
    {
        if (!IsModelLoaded)
        {
            if (!await SelectModelAsync())
            {
                return; // Model could not be loaded
            }
        }

        var audioCaptureService = AudioCaptureService; // Get the lazily-initialized service
        if (audioCaptureService == null)
        {
            AnsiConsole.MarkupLine(
                "[red]Error: Could not determine or initialize an audio capture service for the current OS.[/]");
            return;
        }

        // CancellationTokenSource to signal stop from Workspace to TranscriptionService
        using var cts = new CancellationTokenSource();

        // Allow Ctrl+C to be captured as input
        Console.TreatControlCAsInput = true;

        // Register Ctrl+C handler
        ConsoleCancelEventHandler cancelHandler = (sender, e) =>
        {
            e.Cancel = true; // Prevent immediate termination
            cts.Cancel();
        };
        Console.CancelKeyPress += cancelHandler;

        // Define the device selection logic to be passed to the service
        Func<AudioInputDevice, Task<AudioInputDevice>> selectInputDeviceFunc = async (defaultDevice) =>
        {
            var availableDevices = (await audioCaptureService.GetAvailableDevicesAsync()).ToList();
            // This check is also in TranscriptionService, but good to have early exit here too.
            if (!availableDevices.Any())
            {
                AnsiConsole.MarkupLine(
                    "[yellow]No audio input devices found in Workspace. Please ensure a microphone is connected and configured.[/]");
                cts.Cancel(); // Cancel the operation if no devices found
                return defaultDevice; // or throw an exception
            }

            if (availableDevices.Count == 1)
            {
                return availableDevices.First();
            }
            else
            {
                const string GoBackOption = "Go Back";
                var selectionPrompt = new SelectionPrompt<string>()
                    .Title("Multiple audio input devices detected. Please select one:")
                    .PageSize(10)
                    .AddChoices(availableDevices.Select(d => d.Name));

                selectionPrompt.AddChoice(GoBackOption);

                var selectedDisplayName = await AnsiConsole.PromptAsync(selectionPrompt);

                if (selectedDisplayName == GoBackOption)
                {
                    throw new OperationCanceledException("User cancelled device selection.");
                }

                return availableDevices.First(d => d.Name == selectedDisplayName);
            }
        };

        AnsiConsole.MarkupLine("[cyan]Preparing for live transcription in Workspace...[/]");

        // Create TUI instance
        var tui = new LiveTranscriptionTUI(ModelName!, Config);
        int wordCount = 0;

        // Initialize stream windows based on configuration
        int maxConcurrentStreams = (int)Math.Ceiling(Config.LiveWindowDurationSeconds / Config.LiveAdvanceIntervalSeconds);
        tui.AddLog($"[cyan]Config:[/] Window={Config.LiveWindowDurationSeconds}s, Advance={Config.LiveAdvanceIntervalSeconds}s");
        tui.AddLog($"[cyan]Calculated:[/] {maxConcurrentStreams} concurrent streams");
        for (int i = 1; i <= maxConcurrentStreams; i++)
        {
            tui.GetOrCreateStream(i);
        }
        tui.AddLog($"[green]Sliding window:[/] {maxConcurrentStreams} streams with {Config.LiveWindowDurationSeconds - Config.LiveAdvanceIntervalSeconds}s overlap");

        // Define the action for handling per-window raw transcriptions
        Action<int, string> handleWindowAction = (streamId, rawText) =>
        {
            // Update the specific stream window with raw transcription
            tui.AddStreamText(streamId, rawText);
            tui.SetStreamProcessing(streamId, true);

            if (featureToggles.EnableDiagnosticLogging)
            {
                var preview = rawText.Length > 30 ? rawText.Substring(0, 30) + "..." : rawText;
                tui.AddLog($"[yellow]Stream {streamId}:[/] {Markup.Escape(preview)}");
            }
        };

        // Define the action for handling transcribed segments - feed to TUI
        Action<string> handleSegmentAction = (segmentText) =>
        {
            // Update TUI consolidated display
            tui.AddConsolidatedText(segmentText);

            // Track word count
            var segmentWordCount = segmentText.Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries).Length;
            wordCount += segmentWordCount;
            tui.UpdateWordCount(wordCount);

            // Log segment arrival
            tui.AddLog($"[green]Segment:[/] {segmentWordCount} words added");

            // Notify subscribers (e.g. UI or other components) about the new transcription data
            TranscribedDataAvailable?.Invoke(this, new TranscribedDataEventArgs(segmentText));
        };

        // Start key listener task BEFORE Live display to avoid input blocking
        var keyListenerTask = Task.Run(() =>
        {
            try
            {
                while (!cts.Token.IsCancellationRequested)
                {
                    // Use a tight loop checking for input
                    if (Console.KeyAvailable)
                    {
                        var keyInfo = Console.ReadKey(true);
                        if (keyInfo.Key == ConsoleKey.Escape ||
                            (keyInfo.Key == ConsoleKey.C && keyInfo.Modifiers.HasFlag(ConsoleModifiers.Control)))
                        {
                            tui.AddLog("[yellow]Exit key pressed - stopping...[/]");
                            cts.Cancel();
                            break;
                        }
                    }
                    Thread.Sleep(50); // Check every 50ms
                }
            }
            catch (InvalidOperationException)
            {
                // Console input may be redirected or unavailable
            }
        });

        // Start transcription wrapped in TUI Live display
        try
        {
            await AnsiConsole.Live(tui.Render())
                .AutoClear(false)
                .StartAsync(async ctx =>
                {

                    // Start transcription service task
                    var transcriptionTask = Task.Run(async () =>
                    {
                        try
                        {
                            await _transcriptionService.StartLiveTranscriptionAsync(
                                ModelPath!,
                                featureToggles,
                                audioCaptureService,
                                selectInputDeviceFunc,
                                handleSegmentAction,
                                handleWindowAction, // Per-window callback
                                Config.LiveTranscriptionsDirectory,
                                ModelName!,
                                cts.Token
                            );
                        }
                        catch (OperationCanceledException)
                        {
                            // Expected when user presses ESC
                        }
                        catch (Exception)
                        {
                            // Will be caught in outer try/catch
                            throw;
                        }
                    }, cts.Token);

                    // Render loop - update TUI continuously with stream activity indicators
                    // Simulate overlapping sliding window behavior
                    var startTime = DateTime.Now;
                    var windowDuration = Config.LiveWindowDurationSeconds;
                    var advanceInterval = Config.LiveAdvanceIntervalSeconds;
                    var cycleTime = maxConcurrentStreams * advanceInterval; // Time for all streams to start once

                    while (!cts.Token.IsCancellationRequested && !transcriptionTask.IsCompleted)
                    {
                        try
                        {
                            // Calculate which streams should be active based on elapsed time
                            var elapsed = (DateTime.Now - startTime).TotalSeconds;

                            for (int i = 1; i <= maxConcurrentStreams; i++)
                            {
                                // Each stream has an offset when it first starts
                                var streamStartOffset = (i - 1) * advanceInterval;

                                // Time since this stream's last start (considering repeating cycles)
                                var timeSinceStreamStart = (elapsed - streamStartOffset) % cycleTime;

                                // Handle negative modulo for times before stream first starts
                                if (timeSinceStreamStart < 0)
                                    timeSinceStreamStart += cycleTime;

                                // Stream is active if we're within windowDuration from its last start
                                // AND the stream has actually started (elapsed >= streamStartOffset)
                                bool hasStarted = elapsed >= streamStartOffset;
                                bool isActive = hasStarted && (timeSinceStreamStart < windowDuration);

                                tui.SetStreamProcessing(i, isActive);
                            }

                            ctx.UpdateTarget(tui.Render());
                            await Task.Delay(100, cts.Token);
                        }
                        catch (OperationCanceledException)
                        {
                            break;
                        }
                    }

                    // Final render
                    ctx.UpdateTarget(tui.Render());

                    // Ensure transcription task completes
                    try
                    {
                        await transcriptionTask;
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected
                    }
                });
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]Error during live transcription: {Markup.Escape(ex.Message)}[/]");
        }
        finally
        {
            // Trigger cancellation if not already done
            if (!cts.IsCancellationRequested)
            {
                cts.Cancel();
            }

            // Wait for key listener to finish
            try
            {
                await keyListenerTask.WaitAsync(TimeSpan.FromSeconds(1));
            }
            catch
            {
                // Ignore timeout or task exceptions during cleanup
            }

            // Restore console state
            Console.TreatControlCAsInput = false;
            Console.CancelKeyPress -= cancelHandler;

            AnsiConsole.MarkupLine("\n[cyan]Workspace: Cleaning up audio capture service...[/]");
            if (audioCaptureService != null)
            {
                await audioCaptureService.StopCaptureAsync();
                await audioCaptureService.DisposeAsync();
            }
            AnsiConsole.MarkupLine("[green]Workspace: Audio capture service stopped and disposed.[/]");
            AnsiConsole.WriteLine();
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
}