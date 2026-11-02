using System.Text;
using Spectre.Console;

namespace WhisperPrototype.Framework.TUI;

/// <summary>
/// Represents a visual window displaying a single transcription stream
/// </summary>
public class StreamWindow
{
    private readonly int _streamId;
    private readonly Queue<string> _lines;
    private readonly int _maxLines;
    private bool _isProcessing;

    public int StreamId => _streamId;
    public bool IsProcessing => _isProcessing;

    public StreamWindow(int streamId, int maxLines = 5)
    {
        _streamId = streamId;
        _maxLines = maxLines;
        _lines = new Queue<string>();
    }

    /// <summary>
    /// Adds new text to the stream window
    /// </summary>
    public void AddText(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return;
        }

        // Split text into words and manage line breaks
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var currentLine = _lines.Count > 0 ? _lines.Dequeue() : "";

        foreach (var word in words)
        {
            // If adding this word would make the line too long, start a new line
            if (currentLine.Length + word.Length + 1 > 40) // ~40 chars per line
            {
                _lines.Enqueue(currentLine.Trim());
                currentLine = word + " ";

                // Keep only the last N lines
                while (_lines.Count >= _maxLines)
                {
                    _lines.Dequeue();
                }
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

        // Keep only the last N lines
        while (_lines.Count > _maxLines)
        {
            _lines.Dequeue();
        }
    }

    /// <summary>
    /// Sets the processing status of this stream
    /// </summary>
    public void SetProcessing(bool processing)
    {
        _isProcessing = processing;
    }

    /// <summary>
    /// Clears all text from the window
    /// </summary>
    public void Clear()
    {
        _lines.Clear();
    }

    /// <summary>
    /// Renders this stream window as a Spectre.Console Panel
    /// </summary>
    public Panel Render()
    {
        var statusIndicator = _isProcessing ? "[green]●[/]" : "[grey]○[/]";
        var statusText = _isProcessing ? "Processing..." : "Idle";

        var content = new StringBuilder();
        content.AppendLine($"[[S{_streamId}]] {statusIndicator} {statusText}");

        if (_lines.Any())
        {
            foreach (var line in _lines)
            {
                content.AppendLine(line);
            }
        }
        else
        {
            content.AppendLine("[grey]Waiting for audio...[/]");
        }

        // Let Spectre.Console handle sizing - no fixed padding
        return new Panel(new Markup(content.ToString().TrimEnd()))
        {
            Header = new PanelHeader($"Stream {_streamId}"),
            Border = BoxBorder.Rounded,
            BorderStyle = _isProcessing ? new Style(Color.Green) : new Style(Color.Grey),
            Expand = true, // Allow panel to expand to fill available space
            Padding = new Padding(1, 0, 1, 0) // Reduce vertical padding (left, top, right, bottom)
        };
    }
}

