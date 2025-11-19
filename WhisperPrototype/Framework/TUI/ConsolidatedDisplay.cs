using System.Text;
using Spectre.Console;

namespace WhisperPrototype.Framework.TUI;

/// <summary>
/// Displays the consolidated/stitched transcription output
/// </summary>
public class ConsolidatedDisplay
{
    private readonly Queue<string> _lines;
    private readonly int _maxLines;
    private readonly StringBuilder _fullText;

    public ConsolidatedDisplay(int maxLines = 4)
    {
        _maxLines = maxLines;
        _lines = new Queue<string>();
        _fullText = new StringBuilder();
    }

    /// <summary>
    /// Adds finalized text to the consolidated output
    /// </summary>
    public void AddText(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return;
        }

        // Add space before appending if we already have text and it doesn't end with space
        if (_fullText.Length > 0 && !_fullText.ToString().EndsWith(" "))
        {
            _fullText.Append(" ");
        }
        _fullText.Append(text);

        // Split into display lines (wrap at ~80 characters)
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        
        // Try to continue the last line if it exists and has room
        string currentLine = "";
        if (_lines.Count > 0)
        {
            var lastLine = _lines.ToArray()[^1]; // Get the last line without dequeueing
            if (lastLine.Length < 80)
            {
                // Remove last line to continue it
                var tempLines = _lines.ToArray();
                _lines.Clear();
                for (int i = 0; i < tempLines.Length - 1; i++)
                {
                    _lines.Enqueue(tempLines[i]);
                }
                currentLine = lastLine + " ";
            }
        }

        foreach (var word in words)
        {
            if (currentLine.Length + word.Length + 1 > 80)
            {
                if (!string.IsNullOrWhiteSpace(currentLine))
                {
                    _lines.Enqueue(currentLine.Trim());
                }
                currentLine = word + " ";
            }
            else
            {
                currentLine += word + " ";
            }
        }

        // Add the current line back
        if (!string.IsNullOrWhiteSpace(currentLine))
        {
            _lines.Enqueue(currentLine.Trim());
        }

        // Keep only the last N lines for display
        while (_lines.Count > _maxLines)
        {
            _lines.Dequeue();
        }
    }

    /// <summary>
    /// Gets the full transcribed text
    /// </summary>
    public string GetFullText()
    {
        return _fullText.ToString();
    }

    /// <summary>
    /// Clears all text
    /// </summary>
    public void Clear()
    {
        _lines.Clear();
        _fullText.Clear();
    }

    /// <summary>
    /// Renders the consolidated output as a Spectre.Console Panel
    /// </summary>
    public Panel Render()
    {
        var content = new StringBuilder();

        if (_lines.Any())
        {
            foreach (var line in _lines)
            {
                content.AppendLine(line);
            }
        }
        else
        {
            content.AppendLine("[grey]Waiting for transcription...[/]");
        }

        // Let Spectre.Console handle sizing - no fixed padding
        return new Panel(new Markup(content.ToString().TrimEnd()))
        {
            Header = new PanelHeader("Consolidated Output", Justify.Center),
            Border = BoxBorder.Double,
            BorderStyle = new Style(Color.Cyan1),
            Expand = true, // Allow panel to expand to fill available space
            Padding = new Padding(1, 0, 1, 0) // Reduce vertical padding (left, top, right, bottom)
        };
    }
}

