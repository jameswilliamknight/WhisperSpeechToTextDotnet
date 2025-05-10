using Spectre.Console;

namespace WhisperPrototype;

public class MenuEngine
{
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
}