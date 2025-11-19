using System.Diagnostics;
using System.Globalization;
using System.Text.RegularExpressions;
using Spectre.Console;
using WhisperPrototype.Providers;

namespace WhisperPrototype.Framework
{
    public class FFmpegAudioChunker : IAudioChunker
    {
        private readonly AppSettings _settings;

        public FFmpegAudioChunker(AppSettings settings)
        {
            _settings = settings;
        }

        public async Task<List<AudioSegment>> DetectSpeechSegmentsAsync(string wavFilePath, VADParameters parameters)
        {
            if (_settings.Verbosity >= VerbosityLevel.Normal)
            {
                AnsiConsole.MarkupLine($"[cyan]   Step 2: Detecting speech segments...[/]");
            }
            
            if (_settings.Verbosity >= VerbosityLevel.Debug)
            {
                AnsiConsole.MarkupLine($"[grey]   VAD Parameters: NoiseDB={parameters.SilenceDetectionNoiseDb}, MinSilence={parameters.MinSilenceDurationSeconds}s, MinSpeech={parameters.MinSpeechSegmentSeconds}s, Padding={parameters.SegmentPaddingSeconds}s[/]");
            }

            var silencePoints = new List<double>();
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "ffmpeg", // Assumes ffmpeg is in PATH
                    Arguments = $"-i \"{wavFilePath}\" -af silencedetect=noise={parameters.SilenceDetectionNoiseDb}:duration={parameters.MinSilenceDurationSeconds.ToString(CultureInfo.InvariantCulture)} -f null -",
                    RedirectStandardError = true,
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                }
            };

            var errorOutput = string.Empty;
            process.ErrorDataReceived += (sender, e) => { 
                if (e.Data != null) 
                {
                    errorOutput += e.Data + "\n";
                    var match = Regex.Match(e.Data, @"silence_(start|end): (\d+\.?\d*)");
                    if (match.Success)
                    {
                        var time = double.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
                        silencePoints.Add(time);
                    }
                }
            };

            if (_settings.Verbosity >= VerbosityLevel.Debug)
            {
                AnsiConsole.MarkupLine($"[grey]   FFmpeg command: {Markup.Escape(process.StartInfo.Arguments)}[/]");
            }

            process.Start();
            process.BeginErrorReadLine();
            process.BeginOutputReadLine();
            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
            {
                AnsiConsole.MarkupLine($"[red]   Error: FFmpeg silencedetect failed with exit code {process.ExitCode}.[/]");
                if (_settings.Verbosity >= VerbosityLevel.Debug)
                {
                    AnsiConsole.MarkupLine($"[red]   FFmpeg Stderr:\n{Markup.Escape(errorOutput)}[/]");
                }
                throw new Exception($"FFmpeg failed with exit code {process.ExitCode}. Check logs for details.");
            }
            
            if (_settings.Verbosity >= VerbosityLevel.Verbose)
            {
                AnsiConsole.MarkupLine($"[grey]   Found {silencePoints.Count} silence points[/]");
            }
            
            if (_settings.Verbosity >= VerbosityLevel.Debug)
            {
                AnsiConsole.MarkupLine($"[grey]   Silence points: {string.Join(", ", silencePoints.Select(p => p.ToString("F2")))}s[/]");
            }

            // Sort points just in case FFmpeg output isn't strictly ordered (it usually is)
            silencePoints.Sort(); 

            var speechSegments = new List<AudioSegment>();
            var currentPosition = 0.0;

            // Get total duration of the audio file to handle the last segment
            // We can use FFmpegWrapper or run another quick ffmpeg command here.
            // For simplicity, let's assume we have a way to get duration.
            // This should be replaced with a robust duration fetch.
            var totalDuration = FFmpegWrapper.GetAudioDuration(wavFilePath);
            if (totalDuration == null)
            {
                AnsiConsole.MarkupLine("[red]   Error: Could not determine audio duration.[/]");
                throw new Exception("Could not determine audio duration for VAD.");
            }
            var fileDurationSeconds = totalDuration.Value.TotalSeconds;
            
            if (_settings.Verbosity >= VerbosityLevel.Debug)
            {
                AnsiConsole.MarkupLine($"[grey]   Audio duration: {fileDurationSeconds:F2}s[/]");
            }

            // Handle case with no silence detected (entire file is speech)
            if (!silencePoints.Any())
            {
                if (fileDurationSeconds > parameters.MinSpeechSegmentSeconds)
                {
                     speechSegments.Add(new AudioSegment 
                     {
                         StartTime = TimeSpan.FromSeconds(Math.Max(0, 0 - parameters.SegmentPaddingSeconds)), 
                         EndTime = TimeSpan.FromSeconds(Math.Min(fileDurationSeconds, fileDurationSeconds + parameters.SegmentPaddingSeconds))
                     });
                    if (_settings.Verbosity >= VerbosityLevel.Verbose)
                    {
                        AnsiConsole.MarkupLine($"[green]   No silence detected; treating entire file as one segment[/]");
                    }
                }
                else
                {
                    if (_settings.Verbosity >= VerbosityLevel.Normal)
                    {
                        AnsiConsole.MarkupLine($"[yellow]   Warning: File too short ({fileDurationSeconds:F2}s) for segmentation. No segments generated.[/]");
                    }
                }
                return speechSegments;
            }

            // Iterate through silence points to define speech segments
            // Silence points come in pairs: silence_start, silence_end
            for (var i = 0; i < silencePoints.Count; i += 2)
            {
                var silenceStart = silencePoints[i];
                // If there's an odd number of points, the last silence_start doesn't have a matching silence_end from silencedetect (unlikely but handle)
                var silenceEnd = (i + 1 < silencePoints.Count) ? silencePoints[i + 1] : fileDurationSeconds;

                // Speech segment is from currentPosition to silenceStart
                if (silenceStart > currentPosition)
                {
                    var speechStart = currentPosition;
                    var speechEnd = silenceStart;
                    // Apply padding
                    var paddedSpeechStart = Math.Max(0, speechStart - parameters.SegmentPaddingSeconds);
                    var paddedSpeechEnd = Math.Min(fileDurationSeconds, speechEnd + parameters.SegmentPaddingSeconds);

                    if ((paddedSpeechEnd - paddedSpeechStart) >= parameters.MinSpeechSegmentSeconds)
                    {
                        speechSegments.Add(new AudioSegment { StartTime = TimeSpan.FromSeconds(paddedSpeechStart), EndTime = TimeSpan.FromSeconds(paddedSpeechEnd) });
                        AnsiConsole.MarkupLine($"[green]   Added speech segment (before silence): {speechSegments.Last()}[/]");
                    }
                    else
                    {
                        AnsiConsole.MarkupLine($"[yellow]   Skipped short speech segment (before silence): {TimeSpan.FromSeconds(paddedSpeechStart):g} -> {TimeSpan.FromSeconds(paddedSpeechEnd):g} (Duration: {(paddedSpeechEnd - paddedSpeechStart):F3}s)[/]");
                    }
                }
                currentPosition = silenceEnd; // Move current position to the end of this silence block
            }

            // After the last silence block, if there's remaining audio, it's a speech segment
            if (currentPosition < fileDurationSeconds)
            {
                var speechStart = currentPosition;
                var speechEnd = fileDurationSeconds;
                // Apply padding
                var paddedSpeechStart = Math.Max(0, speechStart - parameters.SegmentPaddingSeconds);
                var paddedSpeechEnd = Math.Min(fileDurationSeconds, speechEnd + parameters.SegmentPaddingSeconds); // Padding at end might be less critical or handled by Whisper

                if ((paddedSpeechEnd - paddedSpeechStart) >= parameters.MinSpeechSegmentSeconds)
                {
                    speechSegments.Add(new AudioSegment { StartTime = TimeSpan.FromSeconds(paddedSpeechStart), EndTime = TimeSpan.FromSeconds(paddedSpeechEnd) });
                }
            }
            
            if (!speechSegments.Any())
            {
                if (_settings.Verbosity >= VerbosityLevel.Normal)
                {
                    AnsiConsole.MarkupLine("[yellow]   Warning: No speech segments detected.[/]");
                }
            }
            else
            {
                if (_settings.Verbosity >= VerbosityLevel.Normal)
                {
                    AnsiConsole.MarkupLine($"[cyan]   Detected {speechSegments.Count} speech segment(s)[/]");
                }
            }
            return speechSegments;
        }
    }
} 