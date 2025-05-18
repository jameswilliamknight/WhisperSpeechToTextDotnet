using Spectre.Console;
using WhisperPrototype;
using Microsoft.Extensions.Configuration;
using WhisperPrototype.Framework;
using WhisperPrototype.Providers;

var exitRequested = false;

// Build configuration
var configuration = new ConfigurationBuilder()
    .SetBasePath(AppContext.BaseDirectory)
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .Build();

// Bind configuration to AppSettings object
var appSettings = new AppSettings();
configuration.GetSection("AppSettings").Bind(appSettings);

if (string.IsNullOrEmpty(appSettings.InputDirectory) || string.IsNullOrEmpty(appSettings.OutputDirectory))
{
    AnsiConsole.MarkupLine("[red]Error: InputDirectory or OutputDirectory not found or empty in appsettings.json.[/]");
    AnsiConsole.MarkupLine("Press any key to exit.");
    Console.ReadKey();
    return;
}

// Handle Ctrl+C for graceful exit
Console.CancelKeyPress += (sender, eventArgs) =>
{
    eventArgs.Cancel = true;
    AnsiConsole.MarkupLine("[red]Ctrl+C detected. Application aborted with exit code 0.[/]");
    Environment.Exit(0);
};

var features = new FeatureToggles();
var menuEngine = new MenuEngine();
var converter = new FFmpegWrapper();
var workspace = new Workspace(appSettings, features, menuEngine, converter);

AnsiConsole.WriteLine("Preparing and checking this device before attempting conversion.");

// Load the model initially
if (!await workspace.SelectModelAsync())
{
    Environment.Exit(1);
    return;
}

AnsiConsole.MarkupLine("[green]Welcome to Whisper Speech to Text Transcription.[/]");

while (!exitRequested)
{
    AnsiConsole.WriteLine(); // Add some spacing
    var choice = await AnsiConsole.PromptAsync(
        new SelectionPrompt<string>()
            .Title("What would you like to do?")
            .PageSize(5)
            .MoreChoicesText("[grey](Move up and down to reveal more options)[/]")
            .AddChoices("Process Audio Recordings", "Live Transcription", "Manage Models", "Exit"));

    switch (choice)
    {
        case "Process Audio Recordings":
            var audioFiles = workspace.GetAudioRecordings();
            await menuEngine.SelectMultipleAndProcessAsync(
                audioFiles,
                //
                // Callback / Func does the processing.
                async (chosenFiles) => await workspace.Transcribe(chosenFiles),
                //
                "Audio Recording",
                fi => fi.Name
            );
            break;

        case "Live Transcription":
            AnsiConsole.MarkupLine("[cyan]Starting live transcription...[/]");
            await workspace.StartLiveTranscriptionAsync(); 
            break;

        case "Manage Models":
            AnsiConsole.MarkupLine("[cyan]Model Management...[/]");
            await workspace.SelectModelAsync();
            break;

        case "Exit":
            AnsiConsole.MarkupLine("[yellow]Exit selected from menu. Shutting down...[/]");
            exitRequested = true;
            break;
    }
}

AnsiConsole.MarkupLine("\n[green]Application exited.[/]");
AnsiConsole.MarkupLine("Press any key to close the window.");

// Keep window open until a key is pressed
Console.ReadKey();
