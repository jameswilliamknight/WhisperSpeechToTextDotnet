namespace WhisperPrototype.Framework.Stitching;

/// <summary>
/// Interface for stitching overlapping transcription segments together.
/// Implementations should handle deduplication and intelligent merging of text.
/// </summary>
public interface ITranscriptionStitcher
{
    /// <summary>
    /// Stitches a new transcription segment with the previous segment,
    /// removing duplicates and returning only unique new content.
    /// </summary>
    /// <param name="previousSegment">The previously transcribed text</param>
    /// <param name="newSegment">The newly transcribed text (may overlap with previous)</param>
    /// <returns>The deduplicated text to append (only new unique content)</returns>
    string StitchSegments(string previousSegment, string newSegment);
    
    /// <summary>
    /// Gets the algorithm name for logging and display purposes
    /// </summary>
    string AlgorithmName { get; }
}

