namespace WhisperPrototype.Framework.Buffering;

/// <summary>
/// Interface for buffering transcribed text with confidence tracking.
/// Holds text in a draft state until confidence thresholds are met.
/// </summary>
public interface ITranscriptionDisplayBuffer
{
    /// <summary>
    /// Adds stitched text to the buffer, tracking word-level confidence
    /// across multiple overlapping windows. May trigger display of finalized text.
    /// </summary>
    /// <param name="text">The stitched text to add to the buffer</param>
    void AddStitchedText(string text);
    
    /// <summary>
    /// Flushes all remaining draft text, displaying everything
    /// (called at end of transcription session)
    /// </summary>
    void Flush();
    
    /// <summary>
    /// Gets the total accumulated text (finalized + draft) for saving to file
    /// </summary>
    /// <returns>Complete transcription text</returns>
    string GetAccumulatedText();
    
    /// <summary>
    /// Gets current buffer statistics for debugging and monitoring
    /// </summary>
    /// <returns>Statistics about the buffer state</returns>
    BufferStatistics GetStatistics();
}

/// <summary>
/// Statistics about the current state of the transcription display buffer
/// </summary>
public class BufferStatistics
{
    /// <summary>
    /// Number of words currently in the draft buffer (not yet finalized)
    /// </summary>
    public int WordsInDraft { get; set; }
    
    /// <summary>
    /// Total number of words that have been finalized and displayed
    /// </summary>
    public int WordsFinalized { get; set; }
    
    /// <summary>
    /// Average confidence score across all words in the draft buffer
    /// </summary>
    public double AverageConfidence { get; set; }
}

