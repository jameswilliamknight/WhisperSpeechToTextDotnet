using System.Text;
using Spectre.Console;

namespace WhisperPrototype.Framework.TUI;

/// <summary>
/// Displays streaming logs and debug information
/// </summary>
public class LogDisplay
{
    private readonly Queue<string> _logs;
    private readonly int _maxLines;

    public LogDisplay(int maxLines = 3)
    {
        _maxLines = maxLines;
        _logs = new Queue<string>();
    }

    /// <summary>
    /// Adds a log message
    /// </summary>
    public void AddLog(string message)
    {
        if (string.IsNullOrEmpty(message))
        {
            return;
        }

        var timestamp = DateTime.Now.ToString("HH:mm:ss");
        var logLine = $"[grey]{timestamp}[/] {message}";
        
        _logs.Enqueue(logLine);

        // Keep only the last N lines
        while (_logs.Count > _maxLines)
        {
            _logs.Dequeue();
        }
    }

    /// <summary>
    /// Clears all logs
    /// </summary>
    public void Clear()
    {
        _logs.Clear();
    }

    /// <summary>
    /// Renders the logs as a Spectre.Console Panel
    /// </summary>
    public Panel Render()
    {
        var content = new StringBuilder();

        if (_logs.Any())
        {
            foreach (var log in _logs)
            {
                content.AppendLine(log);
            }
        }
        else
        {
            content.AppendLine("[grey]No logs yet...[/]");
        }

        return new Panel(new Markup(content.ToString().TrimEnd()))
        {
            Header = new PanelHeader("Logs", Justify.Left),
            Border = BoxBorder.Rounded,
            BorderStyle = new Style(Color.Grey),
            Expand = true,
            Padding = new Padding(1, 0, 1, 0)
        };
    }
}

