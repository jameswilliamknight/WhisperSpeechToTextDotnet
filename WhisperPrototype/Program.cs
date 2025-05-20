using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;
using System.Reflection;
using WhisperPrototype;
using WhisperPrototype.Framework;
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
    .SetBasePath(assemblyDirectory) // <--- THIS IS THE KEY CHANGE
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

        // Register new VAD and Segment Processing services
        services.AddSingleton<IAudioChunker, FFmpegAudioChunker>();

        // FFmpegAudioSegmentProcessor requires the base temporary directory path from AppSettings
        services.AddSingleton<IAudioSegmentProcessor>(provider =>
        {
            var settings = provider.GetRequiredService<AppSettings>();
            var tempDir = settings.TempDirectory;
            if (string.IsNullOrEmpty(tempDir))
            {
                AnsiConsole.MarkupLine("[red]CRITICAL ERROR: AppSettings:TempDirectory is not configured. Segment processing will fail.[/]");
                // Fallback to system temp if absolutely necessary, but configuration is preferred.
                tempDir = Path.GetTempPath(); 
                AnsiConsole.MarkupLine($"[yellow]Warning: Falling back to system temp directory for segments: {tempDir}[/]");
            }
            return new FFmpegAudioSegmentProcessor(tempDir);
        });

        // TranscriptionService now depends on IAudioChunker, IAudioSegmentProcessor, and AppSettings
        services.AddSingleton<ITranscriptionService, TranscriptionService>(); 

        services.AddSingleton<IWorkspace, Workspace>();
    })
    .Build();

AnsiConsole.MarkupLine("[bold green]Whisper Prototype Application Initialized[/]");
AnsiConsole.MarkupLine($"[grey]Input Directory: {appSettingsInstance.InputDirectory ?? "Not Set"}[/]");
AnsiConsole.MarkupLine($"[grey]Output Directory: {appSettingsInstance.OutputDirectory ?? "Not Set"}[/]");
AnsiConsole.MarkupLine($"[grey]Temporary Directory: {appSettingsInstance.TempDirectory ?? "Not Set"}[/]");
AnsiConsole.MarkupLine($"[grey]Models Directory (derived from Input): {Path.Combine(Path.GetDirectoryName(appSettingsInstance.InputDirectory) ?? string.Empty, "Models")}[/]"); // Illustrative

var workspace = host.Services.GetRequiredService<IWorkspace>();
var menuEngine = host.Services.GetRequiredService<MenuEngine>();
var featureToggles = host.Services.GetRequiredService<FeatureToggles>();

// Main application loop (simplified from your original structure for brevity in this diff)
while (true)
{
    var choice = await menuEngine.DisplayMainMenuAndGetChoiceAsync();
    switch (choice)
    {
        case "Select Model":
            await workspace.SelectModelAsync();
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
        case "Live Transcription":
            await workspace.StartLiveTranscriptionAsync();
            break;
        case "Exit":
            AnsiConsole.MarkupLine("[bold red]Exiting application.[/]");
            return;
    }
    // AnsiConsole.MarkupLine("\nPress any key to return to the main menu...");
    // Console.ReadKey();
}
