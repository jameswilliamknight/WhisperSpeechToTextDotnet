using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace WhisperPrototype.Framework
{
    public class AudioSegment
    {
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
        public TimeSpan Duration => EndTime - StartTime;

        public override string ToString()
        {
            return $"Segment: {StartTime:g} -> {EndTime:g} (Duration: {Duration:g})";
        }
    }

    public class VADParameters
    {
        public string SilenceDetectionNoiseDb { get; set; } = "-30dB";
        public double MinSilenceDurationSeconds { get; set; } = 0.8;
        public double MinSpeechSegmentSeconds { get; set; } = 0.3;
        public double SegmentPaddingSeconds { get; set; } = 0.15;
    }

    public interface IAudioChunker
    {
        Task<List<AudioSegment>> DetectSpeechSegmentsAsync(string wavFilePath, VADParameters parameters);
    }
} 