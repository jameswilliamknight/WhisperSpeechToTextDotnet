using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;
using System.Reflection;
using WhisperPrototype;
using WhisperPrototype.Framework;
using WhisperPrototype.Framework.Models;
using WhisperPrototype.Framework.Stitching;
using WhisperPrototype.Hardware;
using WhisperPrototype.Providers;
using Spectre.Console;

// Get the directory where the executing assembly (your .dll) is located.
var assemblyLocation = Assembly.GetExecutingAssembly().Location;
var assemblyDirectory = Path.GetDirectoryName(assemblyLocation);

// Fallback if Path.GetDirectoryName returns null (should be rare for a loaded assembly)
if (string.IsNullOrEmpty(assemblyDirectory))
{
    assemblyDirectory = Directory.GetCurrentDirectory(); // Fallback, but log a warning
    Console.Error.WriteLine($"Warning: Could not determine assembly directory. Using current working directory: {assemblyDirectory}");
}

var configuration = new ConfigurationBuilder()
    .SetBasePath(assemblyDirectory)
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT") ?? "Production"}.json", optional: true)
    .AddEnvironmentVariables()
    .Build();

// Bind AppSettings and FeatureToggles from configuration
var appSettingsInstance = configuration.GetSection("AppSettings").Get<AppSettings>() ?? new AppSettings();
var featureTogglesInstance = configuration.GetSection("FeatureToggles").Get<FeatureToggles>() ?? new FeatureToggles();

// Setup Dependency Injection
using var host = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        // Configuration objects
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSingleton(appSettingsInstance);
        services.AddSingleton(featureTogglesInstance);

        // Core services
        services.AddSingleton<MenuEngine>();
        services.AddSingleton<IAudioConverter, FFmpegWrapper>();
        services.AddSingleton<WindowsDriveMountService>();
        services.AddSingleton<PathTranslationService>();
        services.AddSingleton<SettingsManager>();

        // Register new VAD and Segment Processing services
        services.AddSingleton<IAudioChunker, FFmpegAudioChunker>();

        // FFmpegAudioSegmentProcessor registration
        services.AddSingleton<IAudioSegmentProcessor, FFmpegAudioSegmentProcessor>();

        // Register stitching service using factory
        services.AddSingleton<ITranscriptionStitcher>(sp =>
            StitcherFactory.CreateStitcher(sp.GetRequiredService<AppSettings>()));

        // TranscriptionService now depends on IAudioChunker, IAudioSegmentProcessor, AppSettings, and optional ITranscriptionStitcher
        services.AddSingleton<ITranscriptionService, TranscriptionService>();

        services.AddSingleton<IWorkspace, Workspace>();
    })
    .Build();

// Initialize User Settings
var settingsManager = host.Services.GetRequiredService<SettingsManager>();
await settingsManager.LoadSettingsAsync();

if (settingsManager.IsConfigured())
{
    var inputDir = !string.IsNullOrEmpty(appSettingsInstance.InputDirectory) ? appSettingsInstance.InputDirectory : "[red]Not Set[/]";
    var outputDir = !string.IsNullOrEmpty(appSettingsInstance.OutputDirectory) ? appSettingsInstance.OutputDirectory : "[red]Not Set[/]";
    var tempDir = !string.IsNullOrEmpty(appSettingsInstance.TempDirectory) ? appSettingsInstance.TempDirectory : "[red]Not Set[/]";
    var modelsDir = !string.IsNullOrEmpty(appSettingsInstance.ModelsDirectory)
        ? appSettingsInstance.ModelsDirectory
        : (!string.IsNullOrEmpty(appSettingsInstance.InputDirectory)
            ? Path.Combine(Path.GetDirectoryName(appSettingsInstance.InputDirectory) ?? string.Empty, Constants.ModelsDirectoryName)
            : "[red]Not Set[/]");

    AnsiConsole.MarkupLine($"[grey]Input Directory: {inputDir}[/]");
    AnsiConsole.MarkupLine($"[grey]Output Directory: {outputDir}[/]");
    AnsiConsole.MarkupLine($"[grey]Temporary Directory: {tempDir}[/]");
    AnsiConsole.MarkupLine($"[grey]Models Directory (derived from Input): {modelsDir}[/]");
}

var workspace = host.Services.GetRequiredService<IWorkspace>();
var menuEngine = host.Services.GetRequiredService<MenuEngine>();
var featureToggles = host.Services.GetRequiredService<FeatureToggles>();

// Register ModelManager in DI
var modelManager = new WhisperPrototype.Framework.Models.ModelManager(
    appSettingsInstance.ModelsDirectory ?? Path.Combine(
        Path.GetDirectoryName(appSettingsInstance.InputDirectory ?? Directory.GetCurrentDirectory()) ?? Directory.GetCurrentDirectory(),
        "Models"),
    appSettingsInstance,
    settingsManager);

// Ensure model cache exists at startup
await modelManager.EnsureCacheExistsAsync();

// Load the active model if one was previously selected (silent mode)
var modelLoaded = await workspace.SelectModelAsync(silent: true);

// Display startup status
if (modelLoaded && !string.IsNullOrEmpty(workspace.ModelName))
{
    AnsiConsole.MarkupLine($"[bold green]✓[/] Model loaded: [cyan]{Markup.Escape(workspace.ModelName ?? "")}[/]");
}
else
{
    AnsiConsole.MarkupLine("[red]⚠ No model configured - please select a model from 'Speech Recognition Models'[/]");
}

// Main application loop
while (true)
{
    var isConfigured = settingsManager.IsConfigured();
    var isLiveConfigured = settingsManager.IsLiveTranscriptionConfigured();
    var menuOptions = new List<string>();

    // Speech Recognition Models is always first and always visible
    menuOptions.Add("Speech Recognition Models");

    if (isConfigured)
    {
        menuOptions.Add("Process Audio Recordings");
        if (isLiveConfigured)
        {
            menuOptions.Add("Live Transcription [yellow](Beta)[/]");
        }
        menuOptions.Add("Configure Settings");
    }
    else
    {
        menuOptions.Add("Configure Settings (Required)");
    }
    menuOptions.Add("Exit");

    var choice = await menuEngine.DisplayMainMenuAndGetChoiceAsync(menuOptions);
    switch (choice)
    {
        case "Speech Recognition Models":
            await modelManager.ShowModelMenuAsync();
            // Load the model into workspace if one was selected
            await workspace.SelectModelAsync();
            break;
        case "Configure Settings":
        case "Configure Settings (Required)":
            await settingsManager.ShowConfigurationMenuAsync(
                async () => await modelManager.FetchRemoteModelsAsync(force: true));
            break;
        case "Process Audio Recordings":
            var audioFiles = workspace.GetAudioRecordings();

            // Custom multi-select handler with collision detection
            await menuEngine.SelectMultipleAndProcessAsync(
                audioFiles,
                async (chosenFiles) =>
                {
                    // Get current model name for collision detection
                    if (!workspace.IsModelLoaded)
                    {
                        AnsiConsole.MarkupLine("[yellow]No model loaded. Please select a model first.[/]");
                        return;
                    }

                    var modelName = workspace.ModelName;
                    if (string.IsNullOrEmpty(modelName))
                    {
                        AnsiConsole.MarkupLine("[red]Error: Model name is not available.[/]");
                        return;
                    }

                    var outputDirectory = appSettingsInstance.OutputDirectory;
                    if (string.IsNullOrEmpty(outputDirectory))
                    {
                        AnsiConsole.MarkupLine("[red]Error: Output directory is not configured.[/]");
                        return;
                    }

                    // Check for collisions
                    var filesWithExistingOutput = chosenFiles
                        .Where(file => File.Exists(TranscriptionPathHelper.GetTranscriptionOutputPath(file, modelName, outputDirectory)))
                        .ToList();

                    FileInfo[] finalFilesToProcess = chosenFiles.ToArray();

                    if (filesWithExistingOutput.Any())
                    {
                        // Show collision warning
                        AnsiConsole.WriteLine();
                        AnsiConsole.MarkupLine($"[yellow]⚠ Warning:[/] {filesWithExistingOutput.Count} file(s) have already been transcribed with {Markup.Escape(modelName)}");

                        foreach (var file in filesWithExistingOutput)
                        {
                            var outputPath = TranscriptionPathHelper.GetTranscriptionOutputPath(file, modelName, outputDirectory);
                            var outputFileName = Path.GetFileName(outputPath);
                            AnsiConsole.MarkupLine($"  [grey]-[/] {Markup.Escape(file.Name)}  [grey]->  {Markup.Escape(outputFileName)}[/]");
                        }

                        AnsiConsole.WriteLine();
                        AnsiConsole.MarkupLine("[cyan]Select files to process (re-select to overwrite existing):[/]");

                        // Re-prompt with colliding files deselected by default
                        var defaultSelections = chosenFiles
                            .Where(file => !filesWithExistingOutput.Contains(file))
                            .ToList();

                        // Sort: collisions first, then non-collisions (both in original order)
                        var sortedChosenFiles = filesWithExistingOutput
                            .Concat(chosenFiles.Where(f => !filesWithExistingOutput.Contains(f)))
                            .ToList();

                        var reselectedFiles = await menuEngine.SelectMultipleAsync(
                            sortedChosenFiles,  // Show only originally selected files, sorted with collisions first
                            "Audio Recording",
                            fi => fi.Name,
                            defaultSelections
                        );

                        if (reselectedFiles == null || !reselectedFiles.Any())
                        {
                            AnsiConsole.MarkupLine("[yellow]No files selected for processing.[/]");
                            return;
                        }

                        finalFilesToProcess = reselectedFiles.ToArray();
                    }

                    // Process the final selection
                    await workspace.TranscribeAll(finalFilesToProcess);
                },
                "Audio Recording",
                fi => fi.Name
            );
            break;
        case "Live Transcription [yellow](Beta)[/]":
            await workspace.StartLiveTranscriptionAsync();
            break;
        case "Exit":
            AnsiConsole.MarkupLine("[bold red]Exiting application.[/]");
            return;
    }
}