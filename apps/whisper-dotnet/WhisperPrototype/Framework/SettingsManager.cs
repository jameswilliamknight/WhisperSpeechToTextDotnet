using System.Text.Json;
using Spectre.Console;
using WhisperPrototype.Hardware;

namespace WhisperPrototype.Framework;

public class SettingsManager
{
    private readonly AppSettings _appSettings;
    private readonly WindowsDriveMountService _mountService;
    private readonly PathTranslationService _pathTranslation;
    private readonly string _configPath;
    private readonly JsonSerializerOptions _jsonOptions;

    public SettingsManager(
        AppSettings appSettings, 
        WindowsDriveMountService mountService,
        PathTranslationService pathTranslation)
    {
        _appSettings = appSettings;
        _mountService = mountService;
        _pathTranslation = pathTranslation;

        // Setup config path in ~/.config/whisper-prototype/settings.json
        var xdgConfigHome = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
        var baseConfigDir = !string.IsNullOrEmpty(xdgConfigHome)
            ? xdgConfigHome
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config");

        var configDir = Path.Combine(baseConfigDir, "whisper-prototype");
        Directory.CreateDirectory(configDir);
        _configPath = Path.Combine(configDir, "settings.json");

        _jsonOptions = new JsonSerializerOptions { WriteIndented = true };
    }

    public async Task LoadSettingsAsync()
    {
        if (!File.Exists(_configPath)) return;

        try
        {
            var json = await File.ReadAllTextAsync(_configPath);
            var savedSettings = JsonSerializer.Deserialize<AppSettings>(json, _jsonOptions);

            if (savedSettings != null)
            {
                // Update the singleton instance
                _appSettings.InputDirectory = savedSettings.InputDirectory;
                _appSettings.OutputDirectory = savedSettings.OutputDirectory;
                _appSettings.ModelsDirectory = savedSettings.ModelsDirectory;
                _appSettings.LiveTranscriptionsDirectory = savedSettings.LiveTranscriptionsDirectory;
                _appSettings.TempDirectory = savedSettings.TempDirectory;
                _appSettings.ActiveModelPath = savedSettings.ActiveModelPath;
                _appSettings.Verbosity = savedSettings.Verbosity;
                
                // TUI Mode settings
                _appSettings.LiveUseTUIMode = savedSettings.LiveUseTUIMode;
                _appSettings.LiveTUIMaxVisibleStreams = savedSettings.LiveTUIMaxVisibleStreams;
                _appSettings.LiveTUIStreamHeight = savedSettings.LiveTUIStreamHeight;
                _appSettings.LiveTUIConsolidatedHeight = savedSettings.LiveTUIConsolidatedHeight;
                
                // Restore VAD settings
                _appSettings.SilenceDetectionNoiseDb = savedSettings.SilenceDetectionNoiseDb;
                _appSettings.MinSilenceDurationSeconds = savedSettings.MinSilenceDurationSeconds;
                _appSettings.MinSpeechSegmentSeconds = savedSettings.MinSpeechSegmentSeconds;
                _appSettings.SegmentPaddingSeconds = savedSettings.SegmentPaddingSeconds;
                
                // Restore live transcription settings
                _appSettings.LiveWindowDurationSeconds = savedSettings.LiveWindowDurationSeconds;
                _appSettings.LiveAdvanceIntervalSeconds = savedSettings.LiveAdvanceIntervalSeconds;
                _appSettings.LiveStitchingAlgorithm = savedSettings.LiveStitchingAlgorithm;
                _appSettings.StitchMinimumWordMatch = savedSettings.StitchMinimumWordMatch;
                _appSettings.StitchDiscardPreviousWords = savedSettings.StitchDiscardPreviousWords;
                _appSettings.StitchUseWeighting = savedSettings.StitchUseWeighting;
                _appSettings.StitchUseFuzzyMatching = savedSettings.StitchUseFuzzyMatching;
                _appSettings.StitchFuzzyThreshold = savedSettings.StitchFuzzyThreshold;
                _appSettings.LiveConfidenceThreshold = savedSettings.LiveConfidenceThreshold;
                _appSettings.LiveTranscriptionDraftWords = savedSettings.LiveTranscriptionDraftWords;
                _appSettings.LiveUseVAD = savedSettings.LiveUseVAD;
                _appSettings.LiveVADEnergyThreshold = savedSettings.LiveVADEnergyThreshold;
                _appSettings.LiveVADSilenceDurationSeconds = savedSettings.LiveVADSilenceDurationSeconds;
                _appSettings.LiveVADMinBufferSeconds = savedSettings.LiveVADMinBufferSeconds;
            }
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[yellow]Warning: Failed to load user settings: {ex.Message}[/]");
        }
    }

    public async Task SaveSettingsAsync()
    {
        try
        {
            var json = JsonSerializer.Serialize(_appSettings, _jsonOptions);
            await File.WriteAllTextAsync(_configPath, json);
            AnsiConsole.MarkupLine($"[green]Configuration saved to {_configPath}[/]");
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]Error saving configuration: {ex.Message}[/]");
        }
    }

    public bool IsConfigured()
    {
        return !string.IsNullOrEmpty(_appSettings.InputDirectory) &&
               !string.IsNullOrEmpty(_appSettings.OutputDirectory) &&
               Directory.Exists(_appSettings.InputDirectory); // Basic validation
    }

    public bool IsLiveTranscriptionConfigured()
    {
        return !string.IsNullOrEmpty(_appSettings.LiveTranscriptionsDirectory) &&
               Directory.Exists(_appSettings.LiveTranscriptionsDirectory);
    }

    public async Task ShowConfigurationMenuAsync(Func<Task>? onRefreshModelsCache = null)
    {
        while (true)
        {
            AnsiConsole.Clear();
            AnsiConsole.Write(new Rule("[yellow]Configuration Menu[/]"));
            
            var grid = new Grid();
            grid.AddColumn();
            grid.AddColumn();
            
            grid.AddRow("[grey]Input Directory:[/]", _appSettings.InputDirectory ?? "[red]Not Set[/]");
            grid.AddRow("[grey]Output Directory:[/]", _appSettings.OutputDirectory ?? "[red]Not Set[/]");
            grid.AddRow("[grey]Models Directory:[/]", _appSettings.ModelsDirectory ?? "[red]Not Set[/]");
            grid.AddRow("[grey]Live Transcriptions Directory:[/]", _appSettings.LiveTranscriptionsDirectory ?? "[red]Not Set[/]");
            grid.AddRow("[grey]Temp Directory:[/]", _appSettings.TempDirectory ?? "[red]Not Set[/]");
            
            AnsiConsole.Write(grid);
            AnsiConsole.WriteLine();
            AnsiConsole.MarkupLine($"[dim]Configuration File: {_configPath}[/]");
            AnsiConsole.WriteLine();

            var choices = new List<string>
            {
                "🚀 Quick Setup (Set Base Directory)",
                "------------------------",
                "📁 Set Input Directory",
                "📂 Set Output Directory",
                "🧠 Set Models Directory",
                "🎙️ Set Live Transcriptions Directory",
                "💾 Set Temporary Directory",
                "🗑️ Clear Configuration (Reset)"
            };

            if (onRefreshModelsCache != null)
            {
                choices.Add("🔄 Refresh Models Cache");
            }

            choices.Add("Go Back");

            var choice = await AnsiConsole.PromptAsync(
                new SelectionPrompt<string>()
                    .Title("Select an option:")
                    .AddChoices(choices));

            if (choice == "Go Back") break;

            if (choice.StartsWith("🚀 Quick Setup"))
            {
                await PerformQuickSetupAsync();
            }
            else if (choice.Contains("Set Input Directory"))
            {
                var path = AnsiConsole.Ask<string>("Enter [green]Input Directory[/] (or press Enter to cancel):");
                if (string.IsNullOrWhiteSpace(path))
                {
                    AnsiConsole.MarkupLine("[yellow]Cancelled.[/]");
                    await Task.Delay(1000);
                    continue;
                }
                var validated = await ValidateAndPreparePathAsync(path);
                if (validated != null) _appSettings.InputDirectory = validated;
            }
            else if (choice.Contains("Set Output Directory"))
            {
                var path = AnsiConsole.Ask<string>("Enter [green]Output Directory[/] (or press Enter to cancel):");
                if (string.IsNullOrWhiteSpace(path))
                {
                    AnsiConsole.MarkupLine("[yellow]Cancelled.[/]");
                    await Task.Delay(1000);
                    continue;
                }
                var validated = await ValidateAndPreparePathAsync(path);
                if (validated != null) _appSettings.OutputDirectory = validated;
            }
            else if (choice.Contains("Set Models Directory"))
            {
                var path = AnsiConsole.Ask<string>("Enter [green]Models Directory[/] (or press Enter to cancel):");
                if (string.IsNullOrWhiteSpace(path))
                {
                    AnsiConsole.MarkupLine("[yellow]Cancelled.[/]");
                    await Task.Delay(1000);
                    continue;
                }
                var validated = await ValidateAndPreparePathAsync(path);
                if (validated != null) _appSettings.ModelsDirectory = validated;
            }
            else if (choice.Contains("Set Live Transcriptions Directory"))
            {
                var path = AnsiConsole.Ask<string>("Enter [green]Live Transcriptions Directory[/] (or press Enter to cancel):");
                if (string.IsNullOrWhiteSpace(path))
                {
                    AnsiConsole.MarkupLine("[yellow]Cancelled.[/]");
                    await Task.Delay(1000);
                    continue;
                }
                var validated = await ValidateAndPreparePathAsync(path);
                if (validated != null) _appSettings.LiveTranscriptionsDirectory = validated;
            }
            else if (choice.Contains("Set Temporary Directory"))
            {
                var path = AnsiConsole.Ask<string>("Enter [green]Temporary Directory[/] (or press Enter for default: /tmp/whisper_temp):", "/tmp/whisper_temp");
                if (string.IsNullOrWhiteSpace(path))
                {
                    path = "/tmp/whisper_temp";
                }
                var validated = await ValidateAndPreparePathAsync(path);
                if (validated != null) _appSettings.TempDirectory = validated;
            }
            else if (choice.Contains("Clear Configuration"))
            {
                if (AnsiConsole.Confirm("[red]Are you sure you want to clear the configuration?[/]", defaultValue: false))
                {
                    await ClearConfigurationAsync();
                    // Force loop to refresh display immediately with cleared values
                    continue;
                }
            }
            else if (choice.Contains("Refresh Models Cache") && onRefreshModelsCache != null)
            {
                await onRefreshModelsCache.Invoke();
                await Task.Delay(1000);
            }

            await SaveSettingsAsync();
            
            if (IsConfigured())
            {
                AnsiConsole.MarkupLine("[green]Configuration valid![/]");
                await Task.Delay(1000);
            }
        }
    }

    private async Task PerformQuickSetupAsync()
    {
        AnsiConsole.MarkupLine("\n[cyan]Quick Setup[/] will configure Input and Output directories relative to a base folder.");
        
        // Determine smart default base path
        string defaultBase = "/path/to/project";
        try 
        {
            var winProfile = await _mountService.GetWindowsUserProfilePathAsync();
            if (!string.IsNullOrEmpty(winProfile))
            {
                if (_pathTranslation.IsWindowsPath(winProfile))
                {
                    var wslProfile = _pathTranslation.ConvertToWslPath(winProfile);
                    defaultBase = Path.Combine(wslProfile, "WhisperSTT").Replace('\\', '/');
                }
            }
        }
        catch 
        {
            // Ignore errors fetching profile, fallback to generic default
        }

        var basePath = AnsiConsole.Ask<string>($"Enter [green]Base Directory[/] (default: {defaultBase}, or press Enter to cancel):", defaultBase);
        
        // Allow user to cancel by entering an empty string when there's no default
        if (string.IsNullOrWhiteSpace(basePath) && defaultBase == "/path/to/project")
        {
            AnsiConsole.MarkupLine("[yellow]Quick Setup cancelled.[/]");
            await Task.Delay(1000);
            return;
        }
        
        // Use default if empty was entered
        if (string.IsNullOrWhiteSpace(basePath))
        {
            basePath = defaultBase;
        }
        
        var validatedBase = await ValidateAndPreparePathAsync(basePath);
        if (validatedBase == null) return;

        // Interactive prompt for folder names (with defaults, user can just press Enter)
        var inputDirName = AnsiConsole.Ask<string>("Enter name for [green]Input[/] subdirectory (for audio files, or press Enter for default):", Constants.MeetingsDirectoryName);
        var outputDirName = AnsiConsole.Ask<string>("Enter name for [green]Output[/] subdirectory (for transcripts, or press Enter for default):", Constants.TranscriptionsDirectoryName);

        var inputDir = Path.Combine(validatedBase, inputDirName);
        var outputDir = Path.Combine(validatedBase, outputDirName);
        
        // Confirm structure
        AnsiConsole.WriteLine();
        AnsiConsole.MarkupLine($"Base:   [cyan]{validatedBase}[/]");
        AnsiConsole.MarkupLine($"Input:  [cyan]{inputDir}[/]");
        AnsiConsole.MarkupLine($"Output: [cyan]{outputDir}[/]");
        
        bool inputExists = Directory.Exists(inputDir);
        bool outputExists = Directory.Exists(outputDir);
        
        string promptMessage = (inputExists && outputExists) 
            ? "Structure already exists. Use it?" 
            : "Create this structure?";
        
        if (AnsiConsole.Confirm(promptMessage, true))
        {
            // Ensure base exists first
            if (!Directory.Exists(validatedBase)) 
            {
                try { Directory.CreateDirectory(validatedBase); }
                catch (Exception ex) { AnsiConsole.MarkupLine($"[red]Error creating base directory: {ex.Message}[/]"); return; }
            }

            if (!Directory.Exists(inputDir)) Directory.CreateDirectory(inputDir);
            if (!Directory.Exists(outputDir)) Directory.CreateDirectory(outputDir);
            
            _appSettings.InputDirectory = inputDir;
            _appSettings.OutputDirectory = outputDir;
            
            // ---------------------------------------------------------
            // Configure Models Directory
            // ---------------------------------------------------------
            AnsiConsole.MarkupLine("\n[yellow]Configure Models Directory[/]");
            AnsiConsole.MarkupLine("[dim]This directory stores large model files. You may want to keep it on the base drive or choose a different location.[/]");
            
            var defaultModelsDir = Path.Combine(validatedBase, Constants.ModelsDirectoryName);
            var modelsPath = AnsiConsole.Ask<string>($"Enter [green]Models Directory[/] (default: {defaultModelsDir}, or press Enter for default):", defaultModelsDir);
            
            if (!string.IsNullOrWhiteSpace(modelsPath))
            {
                var validatedModels = await ValidateAndPreparePathAsync(modelsPath);
                if (validatedModels != null)
                {
                    _appSettings.ModelsDirectory = validatedModels;
                }
            }
            else
            {
                // User accepted the default
                var validatedModels = await ValidateAndPreparePathAsync(defaultModelsDir);
                if (validatedModels != null)
                {
                    _appSettings.ModelsDirectory = validatedModels;
                }
            }

            // ---------------------------------------------------------
            // Configure Live Transcriptions Directory (optional)
            // ---------------------------------------------------------
            AnsiConsole.MarkupLine("\n[yellow]Configure Live Transcriptions Directory (Optional)[/]");
            AnsiConsole.MarkupLine("[dim]This directory stores transcripts from live transcription sessions. Leave empty to skip.[/]");
            
            var defaultLiveDir = Path.Combine(validatedBase, "LiveTranscriptions");
            var livePromptResult = AnsiConsole.Ask<string>($"Enter [green]Live Transcriptions Directory[/] (default: {defaultLiveDir}, or press Enter to skip):", "");
            
            if (!string.IsNullOrWhiteSpace(livePromptResult))
            {
                // User provided a path
                var pathToUse = livePromptResult.Equals(defaultLiveDir, StringComparison.OrdinalIgnoreCase) || livePromptResult == "" ? defaultLiveDir : livePromptResult;
                var validatedLive = await ValidateAndPreparePathAsync(pathToUse);
                if (validatedLive != null)
                {
                    _appSettings.LiveTranscriptionsDirectory = validatedLive;
                }
            }
            else if (AnsiConsole.Confirm($"Use default location ({defaultLiveDir})?", false))
            {
                var validatedLive = await ValidateAndPreparePathAsync(defaultLiveDir);
                if (validatedLive != null)
                {
                    _appSettings.LiveTranscriptionsDirectory = validatedLive;
                }
            }

            // Default temp to system temp for performance, or user can change later
            if (string.IsNullOrEmpty(_appSettings.TempDirectory))
            {
                _appSettings.TempDirectory = "/tmp/whisper_temp";
            }
        }
    }

    private async Task ClearConfigurationAsync()
    {
        try 
        {
            if (File.Exists(_configPath)) File.Delete(_configPath);
            
            // Reset in-memory settings
            _appSettings.InputDirectory = null;
            _appSettings.OutputDirectory = null;
            _appSettings.ModelsDirectory = null;
            _appSettings.LiveTranscriptionsDirectory = null;
            _appSettings.TempDirectory = "/tmp/whisper_temp"; 
            
            AnsiConsole.MarkupLine("[green]Configuration cleared.[/]");
            await Task.Delay(1000);
        }
        catch (Exception ex)
        {
             AnsiConsole.MarkupLine($"[red]Error clearing configuration: {ex.Message}[/]");
        }
    }

    private async Task<string?> ValidateAndPreparePathAsync(string inputPath)
    {
        // 1. Validate Path Format
        var (isValid, errorMessage) = _pathTranslation.ValidatePathFormat(inputPath);
        if (!isValid)
        {
            AnsiConsole.MarkupLine($"[red]Invalid path: {errorMessage}[/]");
            return null;
        }

        string wslPath = inputPath;
        string? driveLetter = null;

        // 2. Handle Windows-style paths
        if (_pathTranslation.IsWindowsPath(inputPath))
        {
            driveLetter = _pathTranslation.ExtractDriveLetter(inputPath);
            wslPath = _pathTranslation.ConvertToWslPath(inputPath);
            AnsiConsole.MarkupLine($"[grey]Translating Windows path '{inputPath}' to WSL path '{wslPath}'[/]");
        }
        // 3. Handle WSL paths that point to Windows drives (e.g. /mnt/j/...)
        else
        {
            var windowsPath = _pathTranslation.ConvertToWindowsPath(inputPath);
            if (windowsPath != null)
            {
                // It's a /mnt/ path, check if we can extract a drive letter
                // PathTranslationService doesn't expose ExtractDriveLetter for WSL paths directly, 
                // but ConvertToWindowsPath returns "J:\..." so we can re-extract from that result.
                if (_pathTranslation.IsWindowsPath(windowsPath))
                {
                    driveLetter = _pathTranslation.ExtractDriveLetter(windowsPath);
                }
            }
        }

        // 4. Check mount status if a drive letter is involved
        if (driveLetter != null)
        {
            var (status, _) = await _mountService.GetDriveMountStatusAsync(driveLetter);
            if (status != MountStatus.Mounted)
            {
                AnsiConsole.MarkupLine($"[yellow]Warning: Drive {driveLetter} is not mounted.[/]");
                AnsiConsole.MarkupLine($"[dim]Path requires this drive to verify existence.[/]");
                
                // Use standard Console for this prompt to ensure terminal is in cooked mode for sudo
                Console.Write($"Mount drive {driveLetter} now? (Requires sudo password) [y/N]: ");
                var response = Console.ReadLine();
                var confirmed = response?.Trim().ToLower().StartsWith("y") == true;

                if (confirmed)
                {
                    var result = await _mountService.MountDriveAsync(driveLetter);
                    if (!result.Success)
                    {
                        AnsiConsole.MarkupLine($"[red]Failed to mount drive: {result.ErrorMessage}[/]");
                        return null;
                    }
                    AnsiConsole.MarkupLine("[green]Drive mounted successfully.[/]");
                }
                else
                {
                    AnsiConsole.MarkupLine("[red]Cannot proceed without mounting the drive.[/]");
                    return null;
                }
            }
        }

        // 5. Create directory if missing (Now safe to check since drive is mounted)
        if (!Directory.Exists(wslPath))
        {
            if (AnsiConsole.Confirm($"Directory '{wslPath}' does not exist. Create it?", true))
            {
                try
                {
                    Directory.CreateDirectory(wslPath);
                    AnsiConsole.MarkupLine("[green]Directory created.[/]");
                }
                catch (Exception ex)
                {
                    AnsiConsole.MarkupLine($"[red]Failed to create directory: {ex.Message}[/]");
                    return null;
                }
            }
            else
            {
                return null;
            }
        }

        return wslPath;
    }
}