using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using NAudio.Wave;
using Spectre.Console;
using Whisper.net;
using WhisperPrototype.Events;
using WhisperPrototype.Hardware;
using WhisperPrototype.Providers;

namespace WhisperPrototype.Framework;

public class Workspace(
    AppSettings appConfig,
    FeatureToggles featureToggles,
    MenuEngine menuEngine,
    IAudioConverter converter,
    ITranscriptionService transcriptionService)
    : IWorkspace
{
    private string? ModelPath { get; set; }
    private string? ModelName { get; set; }

    private bool IsInitialised => !string.IsNullOrEmpty(ModelPath) && !string.IsNullOrEmpty(ModelName);

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

    public async Task<bool> SelectModelAsync()
    {
        if (string.IsNullOrEmpty(Config.InputDirectory))
        {
            AnsiConsole.MarkupLine("[red]Error:[/] InputDirectory is not configured in appsettings.json. Cannot determine the Models directory path.");
            throw new InvalidOperationException("InputDirectory is not configured in appsettings.json. Cannot determine the Models directory path.");
        }

        var baseDirectoryFromConfig = Path.GetDirectoryName(Config.InputDirectory);
        if (string.IsNullOrEmpty(baseDirectoryFromConfig))
        {
            AnsiConsole.MarkupLine($"[red]Error:[/] Could not determine a valid parent directory from the configured InputDirectory: [yellow]{Config.InputDirectory}[/]. Cannot locate Models directory.");
            throw new InvalidOperationException($"Could not determine a valid parent directory from the configured InputDirectory ('{Config.InputDirectory}'). Cannot locate Models directory.");
        }

        var modelDirectory = Path.Combine(baseDirectoryFromConfig, "Models");

        if (!Directory.Exists(modelDirectory))
        {
            AnsiConsole.MarkupLine("[red]Error:[/] Model directory not found: [yellow]" + modelDirectory + "[/]");
            AnsiConsole.MarkupLine("[grey](Derived from InputDirectory in appsettings.json)[/]"); // Inform user about the source
            throw new DirectoryNotFoundException($"Model directory not found: {modelDirectory} (derived from InputDirectory in appsettings.json)");
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

    /// <remarks>
    ///     Could create a <tt>AudioTranscribeOptions</tt> record, and pair FileInfo with a set of [Flags] (an enum) of
    ///         options to perform.
    /// 
    ///     First bit, when [Flags] enum value is equal to '1', that marks that we want to chunk the audio by silence.
    ///     Minimum threshold of 15 seconds before considering it something new.
    /// </remarks>
    public async Task TranscribeAll(IEnumerable<FileInfo> audioFiles)
    {
        if (!IsInitialised)
        {
            throw new Exception("Please initialize the workspace before processing.");
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

        var audioCaptureService = AudioCaptureService; // Get the lazily-initialized service
        if (audioCaptureService == null)
        {
            AnsiConsole.MarkupLine(
                "[red]Error: Could not determine or initialize an audio capture service for the current OS.[/]");
            return;
        }

        // CancellationTokenSource to signal stop from Workspace to TranscriptionService
        using var cts = new CancellationTokenSource();

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
                var selectionPrompt = new SelectionPrompt<string>()
                    .Title("Multiple audio input devices detected. Please select one:")
                    .PageSize(10)
                    .AddChoices(availableDevices.Select(d => d.Name));
                var selectedDisplayName = await AnsiConsole.PromptAsync(selectionPrompt);
                return availableDevices.First(d => d.Name == selectedDisplayName);
            }
        };

        // Define the action for handling transcribed segments
        Action<string> handleSegmentAction = (segmentText) =>
        {
            if (featureToggles.EnableDiagnosticLogging)
                AnsiConsole.MarkupLine(
                    $"[yellow]DEBUG: Workspace received segment: '{Markup.Escape(segmentText)}'[/]");
            AnsiConsole.Write(Markup.Escape(segmentText)); // Continuous output
        };

        AnsiConsole.MarkupLine("[cyan]Preparing for live transcription in Workspace...[/]");

        // Start a task to listen for the Escape key to cancel transcription
        var consoleInputTask = Task.Run(() =>
        {
            while (!cts.Token.IsCancellationRequested)
            {
                if (Console.KeyAvailable)
                {
                    if (Console.ReadKey(true).Key == ConsoleKey.Escape)
                    {
                        AnsiConsole.MarkupLine("[yellow]ESC key pressed. Requesting stop...[/]");
                        cts.Cancel();
                        break;
                    }
                }
                Thread.Sleep(100); // Check periodically
            }
        });

        try
        {
            await _transcriptionService.StartLiveTranscriptionAsync(
                ModelPath!,
                featureToggles,
                audioCaptureService,
                selectInputDeviceFunc,
                handleSegmentAction,
                Config.OutputDirectory,
                ModelName!,
                cts.Token
            );
        }
        catch (OperationCanceledException)
        {
            AnsiConsole.MarkupLine("[yellow]Live transcription operation was canceled in Workspace.[/]");
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]Error during live transcription setup or execution in Workspace: {Markup.Escape(ex.Message)}[/]");
        }
        finally
        {
            if (!cts.IsCancellationRequested)
            {
                cts.Cancel(); // Ensure cancellation if not already requested (e.g. service finished early)
            }
            await consoleInputTask; // Ensure the console input task completes

            AnsiConsole.MarkupLine("[cyan]Workspace: Cleaning up audio capture service...[/]");
            if (audioCaptureService != null)
            {
                await audioCaptureService.StopCaptureAsync();
                await audioCaptureService.DisposeAsync();
            }
            AnsiConsole.MarkupLine("[green]Workspace: Audio capture service stopped and disposed.[/]");
            AnsiConsole.WriteLine(); // Ensure a final newline for clean console output
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