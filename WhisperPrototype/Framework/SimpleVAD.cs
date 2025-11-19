namespace WhisperPrototype.Framework;

/// <summary>
/// Simple Voice Activity Detection using energy-based approach.
/// Detects when speech starts and stops based on audio signal energy.
/// </summary>
public class SimpleVAD
{
    private readonly double _energyThreshold;
    private readonly double _silenceDurationSeconds;
    private DateTime _lastSpeechDetected;
    private bool _isSpeaking;
    
    /// <summary>
    /// Gets whether speech is currently being detected
    /// </summary>
    public bool IsSpeaking => _isSpeaking;
    
    /// <summary>
    /// Gets whether silence has been detected for the configured duration
    /// </summary>
    public bool IsSilent => !_isSpeaking && 
                            (DateTime.UtcNow - _lastSpeechDetected).TotalSeconds >= _silenceDurationSeconds;
    
    /// <summary>
    /// Creates a new VAD instance
    /// </summary>
    /// <param name="energyThreshold">Energy threshold for speech detection (0.0-1.0), default 0.02</param>
    /// <param name="silenceDurationSeconds">Seconds of silence before considering speech stopped, default 2.5</param>
    public SimpleVAD(double energyThreshold = 0.02, double silenceDurationSeconds = 2.5)
    {
        _energyThreshold = energyThreshold;
        _silenceDurationSeconds = silenceDurationSeconds;
        _lastSpeechDetected = DateTime.UtcNow;
        _isSpeaking = false;
    }
    
    /// <summary>
    /// Processes audio samples and updates VAD state
    /// </summary>
    /// <param name="audioData">Raw audio bytes (16-bit PCM)</param>
    /// <param name="offset">Offset in the audio data</param>
    /// <param name="count">Number of bytes to process</param>
    /// <returns>True if speech was detected in this chunk</returns>
    public bool ProcessAudio(byte[] audioData, int offset, int count)
    {
        if (count < 2) return false;
        
        // Calculate RMS (Root Mean Square) energy
        double sumSquares = 0;
        int sampleCount = 0;
        
        for (int i = offset; i < offset + count - 1; i += 2)
        {
            short sample = BitConverter.ToInt16(audioData, i);
            double normalized = sample / 32768.0; // Normalize to -1.0 to 1.0
            sumSquares += normalized * normalized;
            sampleCount++;
        }
        
        double rms = sampleCount > 0 ? Math.Sqrt(sumSquares / sampleCount) : 0;
        
        // Check if energy exceeds threshold
        bool hasSpeech = rms > _energyThreshold;
        
        if (hasSpeech)
        {
            _lastSpeechDetected = DateTime.UtcNow;
            _isSpeaking = true;
        }
        else
        {
            // Check if we've been silent long enough
            if ((DateTime.UtcNow - _lastSpeechDetected).TotalSeconds >= _silenceDurationSeconds)
            {
                _isSpeaking = false;
            }
        }
        
        return hasSpeech;
    }
    
    /// <summary>
    /// Resets VAD state (e.g., after processing a final chunk)
    /// </summary>
    public void Reset()
    {
        _lastSpeechDetected = DateTime.UtcNow;
        _isSpeaking = false;
    }
}

