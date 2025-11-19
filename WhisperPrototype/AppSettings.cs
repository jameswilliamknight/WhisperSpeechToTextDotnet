namespace WhisperPrototype
{
    public enum VerbosityLevel
    {
        Quiet = 0,    // Minimal output: just progress and transcribed text
        Normal = 1,   // Default: clean, concise output
        Verbose = 2,  // Detailed: show steps and timing
        Debug = 3     // Everything: including FFmpeg commands and technical details
    }

    public class AppSettings
    {
        public string? InputDirectory { get; set; }
        public string? OutputDirectory { get; set; }
        public string? ModelsDirectory { get; set; }
        public string? LiveTranscriptionsDirectory { get; set; }
        public string? TempDirectory { get; set; }

        // Output verbosity
        public VerbosityLevel Verbosity { get; set; } = VerbosityLevel.Normal; // Default to clean output

        // VAD Parameters for splitting by silence
        public string SilenceDetectionNoiseDb { get; set; } = "-30dB"; // Default to -30dB
        public double MinSilenceDurationSeconds { get; set; } = 0.8;   // Default to 0.8 seconds
        public double MinSpeechSegmentSeconds { get; set; } = 0.3;     // Default to 0.3 seconds
        public double SegmentPaddingSeconds { get; set; } = 0.15;      // Default to 0.15 seconds padding on each side
    }
} 