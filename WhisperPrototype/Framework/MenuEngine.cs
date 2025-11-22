using Spectre.Console;

namespace WhisperPrototype.Framework;

public class MenuEngine
{
    /// <summary>
    ///     Provides a multiselect with <tt>Console.Spectre</tt> and delegates running a 'processor' over those items.
    /// </summary>
    /// <param name="itemsEnumerable">Menu items to multi-select for processing</param>
    /// <param name="processAction">Async Action to do the 'processing'</param>
    /// <param name="itemTypeDescription">e.g., "MP3 file" or "Model"</param>
    /// <param name="displayConverter">A label for the type of file being processed, i.e. "MP3"</param>
    /// <typeparam name="T">Strong typing helper for constraining Funcs</typeparam>
    public async Task SelectMultipleAndProcessAsync<T>(
        IEnumerable<T> itemsEnumerable,
        Func<IEnumerable<T>, Task> processAction,
        string itemTypeDescription,
        Func<T, string> displayConverter) where T : class
    {
        AnsiConsole.MarkupLine($"\n[underline]{itemTypeDescription} Processing Stage[/]");
        var items = itemsEnumerable.ToList();

        if (!items.Any())
        {
            AnsiConsole.MarkupLine($"[yellow]No {itemTypeDescription.ToLower()}(s) available to process.[/]");
            AnsiConsole.MarkupLine("Press any key to return to the main menu.");
            Console.ReadKey();
            return;
        }

        var itemsChosen = await PromptChooseMultipleItemsAsync(items, itemTypeDescription, displayConverter);

        if (itemsChosen is not { Count: > 0 })
        {
            AnsiConsole.MarkupLine("[yellow]No items were selected for processing.[/]");
        }
        else
        {
            AnsiConsole.MarkupLine($"\n[green]Processing {itemsChosen.Count} selected {itemTypeDescription.ToLower()}(s)...[/]");
            await processAction(itemsChosen);
            AnsiConsole.MarkupLine($"[green]Selected {itemTypeDescription.ToLower()}(s) processed.[/]");
        }
    }

    /// <param name="items">Menu items to multi-select from</param>
    /// <param name="itemTypeDescription">e.g., "MP3 file"</param>
    /// <param name="displayConverter">A label for the type of file being processed, i.e. "MP3"</param>
    private async Task<List<T>> PromptChooseMultipleItemsAsync<T>(
        IEnumerable<T> items,
        string itemTypeDescription,
        Func<T, string> displayConverter) where T : class
    {
        AnsiConsole.MarkupLine($"[cyan]Select the {itemTypeDescription.ToLower()}(s) you want to process:[/]");

        var prompt = new MultiSelectionPrompt<T>()
            .Title("Use [blue]Spacebar[/] to toggle selection, [green]Enter[/] to confirm.")
            .PageSize(10)
            .MoreChoicesText("[grey](Move up and down to reveal more items)[/]")
            .InstructionsText(
                "[grey](Press [blue]<space>[/] to toggle an item, " +
                "[green]<enter>[/] to accept or go back if none selected)[/]")
            .UseConverter(displayConverter)
            .AddChoices(items.ToList()); // Ensure it's a list for AddChoices

        var itemsChosen = await AnsiConsole.PromptAsync(prompt);
        return itemsChosen;
    }

    /// <summary>
    /// Prompts user to select multiple items with custom default selections
    /// </summary>
    public async Task<List<T>> SelectMultipleAsync<T>(
        IEnumerable<T> items,
        string itemTypeDescription,
        Func<T, string> displayConverter,
        IEnumerable<T>? defaultSelections = null) where T : class
    {
        AnsiConsole.MarkupLine($"[cyan]Select the {itemTypeDescription.ToLower()}(s) you want to process:[/]");

        var prompt = new MultiSelectionPrompt<T>()
            .Title("Use [blue]Spacebar[/] to toggle selection, [green]Enter[/] to confirm.")
            .PageSize(10)
            .MoreChoicesText("[grey](Move up and down to reveal more items)[/]")
            .InstructionsText(
                "[grey](Press [blue]<space>[/] to toggle an item, " +
                "[green]<enter>[/] to accept or go back if none selected)[/]")
            .UseConverter(displayConverter)
            .AddChoices(items.ToList());

        // Add default selections if provided
        if (defaultSelections != null)
        {
            foreach (var item in defaultSelections)
            {
                prompt.Select(item);
            }
        }

        var itemsChosen = await AnsiConsole.PromptAsync(prompt);
        return itemsChosen;
    }

    public async Task<T?> PromptChooseSingleFile<T>(
        IEnumerable<T> items,
        string title,
        Func<T, string> displayConverter)
        where T : class // Ensure T is a reference type if you need to return null for no selection
    {
        var itemList = items.ToList();
        if (!itemList.Any())
        {
            AnsiConsole.MarkupLine($"[yellow]No items available to select for: {title.EscapeMarkup()}[/]");
            return null;
        }

        // Map display strings to items, preserving order
        var options = new Dictionary<string, T>();
        var choices = new List<string>();

        foreach (var item in itemList)
        {
            var display = displayConverter(item);
            // Ensure unique keys for the prompt
            if (!options.ContainsKey(display))
            {
                options[display] = item;
                choices.Add(display);
            }
        }

        const string GoBackOption = "[red]Go Back[/]";
        choices.Add(GoBackOption);

        var selectionPrompt = new SelectionPrompt<string>()
            .Title(title)
            .PageSize(10)
            .MoreChoicesText("[grey](Move up and down to reveal more options)[/]")
            .HighlightStyle("green")
            .AddChoices(choices);

        var choice = await AnsiConsole.PromptAsync(selectionPrompt);

        if (choice == GoBackOption)
        {
            return null;
        }

        return options[choice];
    }

    public async Task<string> DisplayMainMenuAndGetChoiceAsync(IEnumerable<string> choices)
    {
        AnsiConsole.WriteLine(); // Add some spacing for clarity before the prompt
        var choice = await AnsiConsole.PromptAsync(
            new SelectionPrompt<string>()
                .Title("What would you like to do?")
                .PageSize(10) // Consistent page size
                .MoreChoicesText("[grey](Move up and down to reveal more options)[/]")
                .AddChoices(choices));
        return choice;
    }
}