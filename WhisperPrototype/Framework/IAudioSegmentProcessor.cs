namespace WhisperPrototype.Framework
{
    /// <summary>
    /// Defines a contract for processing an audio segment from a larger audio file.
    /// This could involve extracting the segment to a new stream or providing its data directly.
    /// </summary>
    public interface IAudioSegmentProcessor
    {
        /// <summary>
        /// Processes the given audio segment from the specified parent WAV file and provides a stream for it.
        /// </summary>
        /// <param name="parentWavFilePath">The path to the original (larger) WAV file.</param>
        /// <param name="segment">The specific audio segment to process.</param>
        /// <param name="segmentIndex">The index of the current segment (for naming temporary files, if any).</param>
        /// <param name="totalSegments">Total number of segments for context.</param>
        /// <returns>A Stream containing the audio data for the specified segment. The caller is responsible for disposing this stream.</returns>
        Task<Stream> GetSegmentStreamAsync(string parentWavFilePath, AudioSegment segment, int segmentIndex, int totalSegments);

        // Potential future methods if Whisper.net can efficiently consume byte[] or float[] directly for segments:
        // Task<byte[]> GetSegmentBytesAsync(string parentWavFilePath, AudioSegment segment);
        // Task<float[]> GetSegmentSamplesAsync(string parentWavFilePath, AudioSegment segment);
    }
} 