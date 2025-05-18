namespace WhisperPrototype
{
    public class AppSettings
    {
        public string? InputDirectory { get; set; }
        public string? OutputDirectory { get; set; }
        public string? TempDirectory { get; set; }

        // VAD Parameters for splitting by silence
        public string SilenceDetectionNoiseDb { get; set; } = "-30dB"; // Default to -30dB
        public double MinSilenceDurationSeconds { get; set; } = 0.8;   // Default to 0.8 seconds
        public double MinSpeechSegmentSeconds { get; set; } = 0.3;     // Default to 0.3 seconds
        public double SegmentPaddingSeconds { get; set; } = 0.15;      // Default to 0.15 seconds padding on each side
    }
} 