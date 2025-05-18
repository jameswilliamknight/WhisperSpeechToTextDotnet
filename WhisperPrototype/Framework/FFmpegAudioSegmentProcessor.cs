using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using Spectre.Console;

namespace WhisperPrototype.Framework
{
    public class FFmpegAudioSegmentProcessor : IAudioSegmentProcessor
    {
        private readonly string _baseTempDirectory; // To store extracted segment WAV files

        public FFmpegAudioSegmentProcessor(string baseTempDirectory)
        {
            _baseTempDirectory = Path.Combine(baseTempDirectory, "_segments"); // Subfolder for segment files
            if (!Directory.Exists(_baseTempDirectory))
            {
                Directory.CreateDirectory(_baseTempDirectory);
            }
        }

        public async Task<Stream> GetSegmentStreamAsync(string parentWavFilePath, AudioSegment segment, int segmentIndex, int totalSegments)
        {
            var parentFileName = Path.GetFileNameWithoutExtension(parentWavFilePath);
            var segmentFileName = $"{parentFileName}_segment_{segmentIndex + 1:D4}_of_{totalSegments:D4}.wav";
            var segmentOutputWavPath = Path.Combine(_baseTempDirectory, segmentFileName);

            AnsiConsole.MarkupLine($"[grey]SEGMENT PROCESSOR: Extracting segment {segmentIndex + 1}/{totalSegments} for {Markup.Escape(parentFileName)} to {Markup.Escape(segmentFileName)}[/]");
            AnsiConsole.MarkupLine($"[grey]   Segment details: {segment.StartTime:g} to {segment.EndTime:g} (Duration: {segment.Duration:g})[/]");

            // Ensure segment duration is positive
            if (segment.Duration <= TimeSpan.Zero)
            {
                AnsiConsole.MarkupLine($"[yellow]SEGMENT PROCESSOR: Segment {segmentIndex + 1} has zero or negative duration. Skipping extraction.[/]");
                return Stream.Null; // Or throw an exception, or return an empty memory stream
            }

            // Delete if already exists (as per user preference over asking to overwrite for segments)
            if (File.Exists(segmentOutputWavPath))
            {
                AnsiConsole.MarkupLine($"[grey]   Deleting existing segment file: {Markup.Escape(segmentOutputWavPath)}[/]");
                File.Delete(segmentOutputWavPath);
            }

            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "ffmpeg",
                    // -c copy can be problematic if the source WAV isn't perfectly clean or if padding pushed segment boundaries slightly.
                    // Re-encoding to PCM 16-bit 16kHz mono is safer for Whisper.net.
                    Arguments = $"-i \"{parentWavFilePath}\" -ss {segment.StartTime.TotalSeconds.ToString(CultureInfo.InvariantCulture)} -to {segment.EndTime.TotalSeconds.ToString(CultureInfo.InvariantCulture)} -ar 16000 -ac 1 -sample_fmt s16 \"{segmentOutputWavPath}\"",
                    RedirectStandardError = true,
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                }
            };
            
            var ffmpegErrorOutput = string.Empty;
            process.ErrorDataReceived += (sender, e) => { if (e.Data != null) ffmpegErrorOutput += e.Data + "\n"; };

            AnsiConsole.MarkupLine($"[grey]   Running FFmpeg segment extraction... Command: {Markup.Escape(process.StartInfo.Arguments)}[/]");
            process.Start();
            process.BeginErrorReadLine();
            process.BeginOutputReadLine();
            await process.WaitForExitAsync();
            AnsiConsole.MarkupLine($"[grey]   FFmpeg segment extraction finished for segment {segmentIndex + 1}.[/]");

            if (process.ExitCode != 0 || !File.Exists(segmentOutputWavPath) || new FileInfo(segmentOutputWavPath).Length == 0)
            {
                AnsiConsole.MarkupLine($"[red]SEGMENT PROCESSOR: FFmpeg failed to extract segment {segmentIndex + 1} or created an empty file. Exit Code: {process.ExitCode}[/]");
                AnsiConsole.MarkupLine($"[red]   Parent WAV: {Markup.Escape(parentWavFilePath)}");
                AnsiConsole.MarkupLine($"[red]   Segment Time: {segment.StartTime.TotalSeconds}s to {segment.EndTime.TotalSeconds}s");
                AnsiConsole.MarkupLine($"[red]   Output Path Attempted: {Markup.Escape(segmentOutputWavPath)}");
                AnsiConsole.MarkupLine($"[red]   FFmpeg Stderr:\n{Markup.Escape(ffmpegErrorOutput)}[/]");
                // Return a null stream or throw. For robustness, perhaps allow transcription to continue with other segments.
                return Stream.Null; // Indicates failure for this segment
            }

            AnsiConsole.MarkupLine($"[green]   Successfully extracted segment {segmentIndex + 1} to {Markup.Escape(segmentOutputWavPath)}[/]");
            // Open file with FileShare.Read to allow other processes (like a cleanup) to potentially access it,
            // and FileOptions.DeleteOnClose to automatically clean up this specific segment file once Whisper.net is done with the stream.
            return new FileStream(segmentOutputWavPath, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.DeleteOnClose);
        }
    }

    // Stub implementation for direct byte/float array processing (as requested by user)
    // This would require Whisper.net to support processing raw samples directly for segments.
    public class DirectSampleAudioSegmentProcessor : IAudioSegmentProcessor
    {
        public Task<Stream> GetSegmentStreamAsync(string parentWavFilePath, AudioSegment segment, int segmentIndex, int totalSegments)
        {
            AnsiConsole.MarkupLine($"[magenta]DIRECT SAMPLE PROCESSOR: GetSegmentStreamAsync called for segment {segmentIndex + 1}. This path is not fully implemented for direct sample processing via stream.[/]");
            // This method would typically not be used if direct sample processing is the goal.
            // One might convert samples to a stream here if absolutely necessary, but it's less efficient.
            throw new NotImplementedException("GetSegmentStreamAsync is not the primary method for DirectSampleAudioSegmentProcessor. Use GetSegmentSamplesAsync or GetSegmentBytesAsync.");
        }

        // public async Task<byte[]> GetSegmentBytesAsync(string parentWavFilePath, AudioSegment segment)
        // {
        //    AnsiConsole.MarkupLine($"[magenta]DIRECT SAMPLE PROCESSOR: GetSegmentBytesAsync for segment {segment.StartTime:g}-{segment.EndTime:g}. NOT IMPLEMENTED.[/]");
        //    // Logic using NAudio or FFmpeg to read the segment directly into a byte array
        //    // E.g., using NAudio's WaveFileReader, set Position, then Read.
        //    throw new NotImplementedException();
        // }

        // public async Task<float[]> GetSegmentSamplesAsync(string parentWavFilePath, AudioSegment segment)
        // {
        //    AnsiConsole.MarkupLine($"[magenta]DIRECT SAMPLE PROCESSOR: GetSegmentSamplesAsync for segment {segment.StartTime:g}-{segment.EndTime:g}. NOT IMPLEMENTED.[/]");
        //    // Logic to get bytes (as above) then convert to float samples (PCM 16-bit to float -1.0 to 1.0)
        //    throw new NotImplementedException();
        // }
    }
} 