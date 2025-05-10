using Spectre.Console;

namespace WhisperPrototype;

public class MenuEngine
{
    /// <summary>
    ///     TODO: Refactor so it's independent of 'what' is being chosen.
    ///           i.e. use 'string fileType' like <see cref="SelectFromOptionsAndDelegateProcessingAsync"/>
    /// </summary>
    public async Task<List<string>> PromptChooseFiles(IEnumerable<string> mp3Files)
    {
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
        var mp3FilesChosen = await AnsiConsole.PromptAsync(prompt);

        return mp3FilesChosen;
    }

    public async Task SelectFromOptionsAndDelegateProcessingAsync(IEnumerable<string> files,
        Func<IEnumerable<string>, Task> processAction, string fileType)
    {
        AnsiConsole.MarkupLine($"\n[underline]{fileType} File Processing Stage[/]");
        var fileIter = files.ToArray();

        if (!fileIter.Any())
        {
            AnsiConsole.MarkupLine($"[yellow]No {fileType} files available to process.[/]");
            AnsiConsole.MarkupLine("Press any key to return to the main menu.");
            Console.ReadKey();
            return;
        }

        var mp3FilesChosen = await PromptChooseFiles(fileIter);

        if (mp3FilesChosen is not { Count: > 0 })
        {
            AnsiConsole.MarkupLine("[yellow]No files were selected for processing.[/]");
        }
        else
        {
            AnsiConsole.MarkupLine($"\n[green]Processing {mp3FilesChosen.Count} selected {fileType} file(s)...[/]");
            
            // Use the provided action to process files
            await processAction(mp3FilesChosen.ToArray());
            
            AnsiConsole.MarkupLine($"\n[green]Selected {fileType} files processed.[/]");
        }
        AnsiConsole.MarkupLine("Press any key to return to the main menu.");
        Console.ReadKey();
    }
}