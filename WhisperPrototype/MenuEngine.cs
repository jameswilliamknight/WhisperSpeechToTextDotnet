using Spectre.Console;

namespace WhisperPrototype;

public class MenuEngine
{
    public async Task SelectFromOptionsAndDelegateProcessingAsync(
        IEnumerable<string> filesEnumerable,
        Func<IEnumerable<string>, Task> processAction,
        string fileType)
    {
        AnsiConsole.MarkupLine($"\n[underline]{fileType} File Processing Stage[/]");
        var files = filesEnumerable.ToArray();

        if (files.Length == 0)
        {
            AnsiConsole.MarkupLine($"[yellow]No {fileType} files available to process.[/]");
            AnsiConsole.MarkupLine("Press any key to return to the main menu.");
            Console.ReadKey();
            return;
        }

        var mp3FilesChosen = await PromptChooseFiles(files, "MP3");

        if (mp3FilesChosen is not { Count: > 0 })
        {
            AnsiConsole.MarkupLine("[yellow]No files were selected for processing.[/]");
        }
        else
        {
            AnsiConsole.MarkupLine($"\n[green]Processing {mp3FilesChosen.Count} selected {fileType} file(s)...[/]");

            // ⭐ Use the provided action to process files
            await processAction(mp3FilesChosen.ToArray());

            AnsiConsole.MarkupLine($"\n[green]Selected {fileType} files processed.[/]");
        }

        AnsiConsole.MarkupLine("Press any key to return to the main menu.");
        Console.ReadKey();
    }

    private async Task<List<string>> PromptChooseFiles(IEnumerable<string> files, string fileType)
    {
        AnsiConsole.MarkupLine($"[cyan]Select the {fileType} files you want to process:[/]");

        var prompt = new MultiSelectionPrompt<string>()
            .Title("Use [blue]Spacebar[/] to toggle selection, [green]Enter[/] to confirm.")
            .PageSize(10)
            .MoreChoicesText("[grey](Move up and down to reveal more files)[/]")
            .InstructionsText(
                "[grey](Press [blue]<space>[/] to toggle a file, " +
                "[green]<enter>[/] to accept)[/]")
            .AddChoices(files);

        // Wait for the user's selection
        var mp3FilesChosen = await AnsiConsole.PromptAsync(prompt);

        return mp3FilesChosen;
    }
}