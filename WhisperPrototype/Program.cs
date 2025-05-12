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
    eventArgs.Cancel = true;
    AnsiConsole.MarkupLine("[red]Ctrl+C detected. Application aborted with exit code 0.[/]");
    Environment.Exit(0);
};

var features = new FeatureToggles();
var workspace = new Workspace(appSettings, features);
var menuEngine = new MenuEngine();

AnsiConsole.WriteLine("Preparing and checking this device before attempting conversion.");

// TODO: decouple model selection, choose when to call it - don't call it here once we persist config, have additional menu item for choosing the model. 
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
        Environment.Exit(1);
        return;
    }
    workspace.LoadModel(selectedModelFile);
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
            await menuEngine.SelectMultipleAndProcessAsync<FileInfo>(
                audioFiles,
                async (chosenFiles) => await workspace.Process(chosenFiles),
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
            AnsiConsole.MarkupLine("[yellow]Model management feature not yet fully implemented.[/]");
            AnsiConsole.MarkupLine("Press any key to return to the main menu.");
            //
            // Keep the message visible until a key is pressed
            Console.ReadKey();
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
