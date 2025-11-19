namespace WhisperPrototype
{
    public enum VerbosityLevel
    {
        Quiet = 0,    // Minimal output: just progress and transcribed text
        Normal = 1,   // Default: clean, concise output
        Verbose = 2,  // Detailed: show steps and timing
        Debug = 3     // Everything: including FFmpeg commands and technical details
    }

    public enum ConfidenceThreshold
    {
        Low = 1,      // Flush after 1 match (immediate, ~60% confidence)
        Medium = 2,   // Flush after 2 matches (~80% confidence) - RECOMMENDED
        High = 3      // Flush after 3 matches (100% confidence, most delay)
    }

    public class AppSettings
    {
        public string? InputDirectory { get; set; }
        public string? OutputDirectory { get; set; }
        public string? ModelsDirectory { get; set; }
        public string? LiveTranscriptionsDirectory { get; set; }
        public string? TempDirectory { get; set; }

        // Model Management
        public string? ActiveModelPath { get; set; }

        // Output verbosity
        public VerbosityLevel Verbosity { get; set; } = VerbosityLevel.Normal; // Default to clean output

        // TUI Mode Settings
        public bool LiveUseTUIMode { get; set; } = false;
        public int LiveTUIMaxVisibleStreams { get; set; } = 3;
        public int LiveTUIStreamHeight { get; set; } = 6;
        public int LiveTUIConsolidatedHeight { get; set; } = 4;

        // VAD Parameters for splitting by silence
        public string SilenceDetectionNoiseDb { get; set; } = "-30dB"; // Default to -30dB
        public double MinSilenceDurationSeconds { get; set; } = 0.8;   // Default to 0.8 seconds
        public double MinSpeechSegmentSeconds { get; set; } = 0.3;     // Default to 0.3 seconds
        public double SegmentPaddingSeconds { get; set; } = 0.15;      // Default to 0.15 seconds padding on each side

        // Live transcription overlapping window settings
        public float LiveWindowDurationSeconds { get; set; } = 15.0f;
        public float LiveAdvanceIntervalSeconds { get; set; } = 5.0f;

        // Stitching algorithm selection and parameters
        public string LiveStitchingAlgorithm { get; set; } = "BoundaryWeighted"; // "BoundaryWeighted", "Simple"
        public int StitchMinimumWordMatch { get; set; } = 2;
        public int StitchDiscardPreviousWords { get; set; } = 4;
        public bool StitchUseWeighting { get; set; } = true;
        
        // Fuzzy matching for handling Whisper transcription inconsistencies
        public bool StitchUseFuzzyMatching { get; set; } = true;
        public double StitchFuzzyThreshold { get; set; } = 0.80; // 80% similarity required (0.0-1.0)

        // Confidence tracking and display buffer
        public ConfidenceThreshold LiveConfidenceThreshold { get; set; } = ConfidenceThreshold.Medium;
        public int LiveTranscriptionDraftWords { get; set; } = 20;
        
        // Voice Activity Detection (VAD) settings for end-of-speech detection
        public bool LiveUseVAD { get; set; } = true;
        public double LiveVADEnergyThreshold { get; set; } = 0.015; // 1.5% energy threshold (lower = less sensitive)
        public double LiveVADSilenceDurationSeconds { get; set; } = 4.5; // 4.5 seconds of silence
        public int LiveVADMinBufferSeconds { get; set; } = 5; // Minimum 5 seconds of audio before VAD triggers
    }
} 