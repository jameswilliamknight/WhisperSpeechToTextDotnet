namespace WhisperPrototype;

/// <summary>
/// Contains feature toggles to control diagnostic and logging behavior
/// </summary>
public class FeatureToggles
{
    /// <summary>
    /// Controls verbose audio data logging
    /// </summary>
    public bool LogAudioDataReceivedMessages { get; set; } = false;
    
    /// <summary>
    /// Controls detailed diagnostic messages for transcription flow
    /// </summary>
    public bool EnableDiagnosticLogging { get; set; } = false;
    
    /// <summary>
    /// Controls "Processing audio chunk..." messages
    /// </summary>
    public bool LogProcessingChunkMessages { get; set; } = false;
} 