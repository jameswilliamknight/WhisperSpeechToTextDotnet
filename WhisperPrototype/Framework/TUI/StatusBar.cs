using System.Diagnostics;
using Spectre.Console;

namespace WhisperPrototype.Framework.TUI;

/// <summary>
/// Displays real-time metrics for live transcription
/// </summary>
public class StatusBar
{
    private readonly Stopwatch _elapsed;
    private string _vadStatus;
    private int _bufferSeconds;
    private int _wordCount;
    private string _modelName;

    public StatusBar(string modelName)
    {
        _elapsed = Stopwatch.StartNew();
        _vadStatus = "IDLE";
        _bufferSeconds = 0;
        _wordCount = 0;
        _modelName = Path.GetFileNameWithoutExtension(modelName);
    }

    /// <summary>
    /// Updates the VAD status
    /// </summary>
    public void SetVADStatus(bool isSpeechDetected)
    {
        _vadStatus = isSpeechDetected ? "START" : "STOP";
    }

    /// <summary>
    /// Updates the buffer size
    /// </summary>
    public void SetBufferSize(int seconds)
    {
        _bufferSeconds = seconds;
    }

    /// <summary>
    /// Updates the word count
    /// </summary>
    public void SetWordCount(int count)
    {
        _wordCount = count;
    }

    /// <summary>
    /// Renders the status bar
    /// </summary>
    public Markup Render()
    {
        var vadColor = _vadStatus == "START" ? "green" : "yellow";
        var elapsed = _elapsed.Elapsed;
        var elapsedStr = $"{(int)elapsed.TotalMinutes:D2}:{elapsed.Seconds:D2}";

        return new Markup(
            $"[{vadColor}][[VAD-{_vadStatus}]][/] │ " +
            $"Buffer: [cyan]{_bufferSeconds}s[/] │ " +
            $"Words: [cyan]{_wordCount}[/] │ " +
            $"Elapsed: [cyan]{elapsedStr}[/] │ " +
            $"Model: [cyan]{_modelName}[/] │ " +
            $"[grey]Press ESC or Ctrl+C to stop[/]"
        );
    }
}

