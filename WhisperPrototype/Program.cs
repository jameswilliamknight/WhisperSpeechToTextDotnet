using Spectre.Console;
using WhisperPrototype;

var workspace = new Workspace();

Console.WriteLine("Starting Whisper Speech to Text Transcription.");

var mp3Files = workspace.GetMp3Files();

// Check if any MP3 files were found
if (mp3Files is { Length: 0 })
{
    AnsiConsole.MarkupLine("[yellow]No MP3 files found in the workspace.[/]");
    Console.WriteLine("Press Enter to exit.");
    Console.ReadLine();
    return; // ⚠️ Exit if no files
}

var menu = new MenuEngine(); // might not need state, could go static.
var mp3FilesChosen = await menu.PromptChooseFiles(mp3Files);

// Check if the user selected any files
if (mp3FilesChosen is { Count: 0 })
{
    AnsiConsole.MarkupLine("[yellow]No files were selected for processing.[/]");
}
else
{
    AnsiConsole.MarkupLine($"\n[green]Processing {mp3FilesChosen.Count} selected file(s)...[/]");
    
    // Process only the chosen files
    await workspace.Process(mp3FilesChosen.ToArray());
    
    AnsiConsole.MarkupLine("\n[green]Selected MP3 files processed.[/]");
}

Console.WriteLine("Press Enter to exit.");
Console.ReadLine();