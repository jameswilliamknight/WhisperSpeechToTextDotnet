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

AnsiConsole.MarkupLine("[bold green]Whisper Prototype Application Initialized[/]");

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
            break;
        case "Configure Settings":
        case "Configure Settings (Required)":
            await settingsManager.ShowConfigurationMenuAsync();
            break;
        case "Process Audio Recordings":
            var audioFiles = workspace.GetAudioRecordings();
            await menuEngine.SelectMultipleAndProcessAsync(
                audioFiles,
                async (chosenFiles) => await workspace.TranscribeAll(chosenFiles),
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