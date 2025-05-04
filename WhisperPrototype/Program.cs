using Spectre.Console; // Add this using directive
using WhisperPrototype;

IWorkspace workspace = new Workspace();

Console.WriteLine("Starting Whisper Speech to Text Transcription.");

string[] mp3Files = workspace.GetMp3Files();

// Check if any MP3 files were found
if (mp3Files == null || mp3Files.Length == 0)
{
    AnsiConsole.MarkupLine("[yellow]No MP3 files found in the workspace.[/]");
    Console.WriteLine("Press Enter to exit.");
    Console.ReadLine();
    return; // Exit if no files
}

// --- Implementation of the TODO ---
AnsiConsole.MarkupLine("[cyan]Select the MP3 files you want to process:[/]");

// Create and configure the multi-selection prompt
var prompt = new MultiSelectionPrompt<string>()
    .Title("Use [blue]Spacebar[/] to toggle selection, [green]Enter[/] to confirm.")
    .PageSize(10) // Show 10 items per page
    .MoreChoicesText("[grey](Move up and down to reveal more files)[/]")
    .InstructionsText(
        "[grey](Press [blue]<space>[/] to toggle a file, " +
        "[green]<enter>[/] to accept)[/]")
    .AddChoices(mp3Files); // Add the discovered MP3 files as choices

// Show the prompt and wait for the user's selection
List<string> mp3FilesChosen = await AnsiConsole.PromptAsync(prompt);
// --- End of Implementation ---

// Check if the user selected any files
if (mp3FilesChosen == null || mp3FilesChosen.Count == 0)
{
    AnsiConsole.MarkupLine("[yellow]No files were selected for processing.[/]");
}
else
{
    AnsiConsole.MarkupLine($"\n[green]Processing {mp3FilesChosen.Count} selected file(s)...[/]");
    // Process only the chosen files
    // Note: workspace.Process might expect string[], so convert if necessary
    await workspace.Process(mp3FilesChosen.ToArray());
    AnsiConsole.MarkupLine("\n[green]Selected MP3 files processed.[/]");
}

Console.WriteLine("Press Enter to exit.");
Console.ReadLine();