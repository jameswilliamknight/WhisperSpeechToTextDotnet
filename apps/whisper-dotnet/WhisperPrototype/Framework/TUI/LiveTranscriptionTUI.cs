using Spectre.Console;
using Spectre.Console.Rendering;

namespace WhisperPrototype.Framework.TUI;

/// <summary>
/// TUI orchestrator for live transcription with real-time visual feedback
/// </summary>
public class LiveTranscriptionTUI
{
    private readonly Dictionary<int, StreamWindow> _streamWindows;
    private readonly ConsolidatedDisplay _consolidatedDisplay;
    private readonly LogDisplay _logDisplay;
    private readonly StatusBar _statusBar;
    private readonly int _maxVisibleStreams;
    private readonly int _streamHeight;

    public LiveTranscriptionTUI(string modelName, AppSettings settings)
    {
        _streamWindows = new Dictionary<int, StreamWindow>();
        _consolidatedDisplay = new ConsolidatedDisplay(settings.LiveTUIConsolidatedHeight);
        _logDisplay = new LogDisplay(3); // Show last 3 log lines
        _statusBar = new StatusBar(modelName);
        _maxVisibleStreams = settings.LiveTUIMaxVisibleStreams;
        _streamHeight = settings.LiveTUIStreamHeight;
    }

    /// <summary>
    /// Gets or creates a stream window for the given stream ID
    /// </summary>
    public StreamWindow GetOrCreateStream(int streamId)
    {
        if (!_streamWindows.ContainsKey(streamId))
        {
            _streamWindows[streamId] = new StreamWindow(streamId, _streamHeight);
        }
        return _streamWindows[streamId];
    }

    /// <summary>
    /// Adds transcription text to a specific stream
    /// </summary>
    public void AddStreamText(int streamId, string text)
    {
        var stream = GetOrCreateStream(streamId);
        stream.AddText(text);
    }

    /// <summary>
    /// Sets the processing status for a stream
    /// </summary>
    public void SetStreamProcessing(int streamId, bool processing)
    {
        var stream = GetOrCreateStream(streamId);
        stream.SetProcessing(processing);
    }

    /// <summary>
    /// Adds finalized text to the consolidated output
    /// </summary>
    public void AddConsolidatedText(string text)
    {
        _consolidatedDisplay.AddText(text);
    }

    /// <summary>
    /// Updates the VAD status in the status bar
    /// </summary>
    public void UpdateVADStatus(bool isSpeechDetected)
    {
        _statusBar.SetVADStatus(isSpeechDetected);
    }

    /// <summary>
    /// Updates the buffer size in the status bar
    /// </summary>
    public void UpdateBufferSize(int seconds)
    {
        _statusBar.SetBufferSize(seconds);
    }

    /// <summary>
    /// Updates the word count in the status bar
    /// </summary>
    public void UpdateWordCount(int count)
    {
        _statusBar.SetWordCount(count);
    }

    /// <summary>
    /// Adds a log message to the logs panel
    /// </summary>
    public void AddLog(string message)
    {
        _logDisplay.AddLog(message);
    }

    /// <summary>
    /// Renders the complete TUI layout
    /// </summary>
    public IRenderable Render()
    {
        // Get the visible streams (limit to maxVisibleStreams)
        var visibleStreams = _streamWindows.Values
            .OrderBy(s => s.StreamId)
            .Take(_maxVisibleStreams)
            .ToList();

        // Create stream columns
        var streamPanels = visibleStreams.Select(s => s.Render()).Cast<IRenderable>().ToArray();
        
        Layout streamsLayout;
        if (streamPanels.Any())
        {
            // Create equal columns for streams with proper ratios
            streamsLayout = new Layout("Streams");
            if (streamPanels.Length == 1)
            {
                streamsLayout.Update(streamPanels[0]);
            }
            else
            {
                // Split columns with equal ratio for each stream
                var streamLayouts = streamPanels.Select((_, i) => new Layout($"Stream{i}").Ratio(1)).ToArray();
                streamsLayout.SplitColumns(streamLayouts);
                for (int i = 0; i < streamPanels.Length; i++)
                {
                    streamsLayout[$"Stream{i}"].Update(streamPanels[i]);
                }
            }
        }
        else
        {
            streamsLayout = new Layout("Streams")
                .Update(new Panel("[grey]Waiting for audio streams...[/]")
                {
                    Header = new PanelHeader("Streams"),
                    Border = BoxBorder.Rounded,
                    Expand = true
                });
        }

        // Create the main layout with better proportions
        // Streams: 3 parts, Consolidated: 2 parts, Logs: 1 part, Status: 1 line
        var mainLayout = new Layout("Root")
            .SplitRows(
                new Layout("Streams").Ratio(3),
                new Layout("Consolidated").Ratio(2),
                new Layout("Logs").Size(5),  // Fixed height for logs (3 lines + borders)
                new Layout("Status").Size(1)
            );

        // Populate the layout sections
        mainLayout["Streams"].Update(streamsLayout);
        mainLayout["Consolidated"].Update(_consolidatedDisplay.Render());
        mainLayout["Logs"].Update(_logDisplay.Render());
        mainLayout["Status"].Update(_statusBar.Render());

        return mainLayout;
    }

    /// <summary>
    /// Gets the full consolidated text
    /// </summary>
    public string GetFullText()
    {
        return _consolidatedDisplay.GetFullText();
    }
}

