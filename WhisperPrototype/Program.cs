using Spectre.Console;
using WhisperPrototype;
using Microsoft.Extensions.Configuration;

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
    AnsiConsole.MarkupLine("\n[yellow]Exit requested via Ctrl+C. Shutting down gracefully...[/]");
    eventArgs.Cancel = true; // Prevent immediate termination by the OS
    exitRequested = true;
};

var workspace = new Workspace(appSettings);
var menuEngine = new MenuEngine();

AnsiConsole.MarkupLine("[green]Welcome to Whisper Speech to Text Transcription.[/]");

while (!exitRequested)
{
    AnsiConsole.WriteLine(); // Add some spacing
    var choice = AnsiConsole.Prompt(
        new SelectionPrompt<string>()
            .Title("What would you like to do?")
            .PageSize(5)
            .MoreChoicesText("[grey](Move up and down to reveal more options)[/]")
            .AddChoices("Process MP3 files", "Exit"));

    switch (choice)
    {
        case "Process MP3 files":
            var mp3Files = workspace.GetMp3Files();
            await menuEngine.SelectFromOptionsAndDelegateProcessingAsync(
                mp3Files,
                async (chosenFiles) => await workspace.Process(chosenFiles), 
                "MP3");
            break;
        
        case "Exit":
            exitRequested = true;
            break;
    }
}

AnsiConsole.MarkupLine("\n[green]Application exited.[/]");
AnsiConsole.MarkupLine("Press any key to close the window.");

// Keep window open until a key is pressed
Console.ReadKey();
