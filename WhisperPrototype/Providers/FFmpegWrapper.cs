using System.Diagnostics;
using Spectre.Console;

namespace WhisperPrototype.Providers;

public class FFmpegWrapper : IAudioConverter
{
    public void ToWav(string inputPath, string wavPath)
    {
        // ffmpeg command to convert input audio (like MP3) to 16kHz, 16-bit PCM, mono WAV
        // -y overwrites output file without asking
        // -i input file path
        // -acodec pcm_s16le sets the output audio codec to 16-bit signed little-endian PCM
        // -ar 16000 sets the audio sample rate to 16000 Hz
        // -ac 1 sets the number of audio channels to 1 (mono)
        var ffmpegArgs = $"-y -i \"{inputPath}\" -acodec pcm_s16le -ar 16000 -ac 1 \"{wavPath}\"";

        var startInfo = new ProcessStartInfo
        {
            // Assumes ffmpeg is in the system's PATH
            FileName = "ffmpeg",
            //
            Arguments = ffmpegArgs,
            UseShellExecute = false,
            //
            // For potential debugging info
            RedirectStandardOutput = true,
            //
            RedirectStandardError = true,
            //
            // Don't create a visible window (for console app)
            CreateNoWindow = true
        };

        AnsiConsole.WriteLine($"Executing: ffmpeg {ffmpegArgs}");

        using var process = new Process();
        process.StartInfo = startInfo;

        try
        {
            process.Start();

            // Read output/error streams to prevent deadlocks
            process.StandardOutput.ReadToEnd();
            var error = process.StandardError.ReadToEnd();

            process.WaitForExit();

            if (process.ExitCode == 0)
            {
                return;
            }
            
            // ffmpeg returned a non-zero exit code, an error occurred
            AnsiConsole.MarkupLine("[red]ffmpeg Error Output:[/]");
            AnsiConsole.MarkupLine($"[red]{error}[/]");
            throw new Exception(
                $"ffmpeg process failed with exit code {process.ExitCode}. See console output for details.");

            // Optional
            // AnsiConsole.WriteLine("ffmpeg Output:");
            // AnsiConsole.WriteLine(output);
            // AnsiConsole.WriteLine("ffmpeg Error (info usually):");
            // AnsiConsole.WriteLine(error);
        }
        catch (Exception ex)
        {
            // Catch errors e.g. 'ffmpeg not found'
            AnsiConsole.MarkupLine($"[red]Failed to run ffmpeg. Is ffmpeg installed and in the system's PATH?[/]");
            AnsiConsole.MarkupLine($"[red]{ex.Message}[/]");
            throw new Exception("ffmpeg execution failed.", ex);
        }
    }

    /// <summary>
    ///     Gets the duration of an audio/video file using ffmpeg.
    /// </summary>
    public static TimeSpan? GetAudioDuration(string filePath)
    {
        // Arguments to get only the duration value
        var ffprobeArgs =
            $"-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"{filePath}\"";
        
        var startInfo = new ProcessStartInfo("ffprobe", ffprobeArgs)
        {
            RedirectStandardOutput = true, // Need this for the duration value (plain text output from command)
            RedirectStandardError = true, // Need this to capture potential errors
            UseShellExecute = false,
            CreateNoWindow = true
        };

        try
        {
            using var process = new Process();
            process.StartInfo = startInfo;
            process.Start();

            var reportedAudioLengthOutput = process.StandardOutput.ReadToEnd();
            var errorOutput = process.StandardError.ReadToEnd();

            process.WaitForExit();

            // Optional: Keep debug output if needed
            // AnsiConsole.WriteLine($"Duration Detection (ffprobe stdout): {durationStr}");
            // AnsiConsole.WriteLine($"Duration Detection (ffprobe stderr): {errorOutput}");

            // Directly parse the output string
            if (!string.IsNullOrWhiteSpace(reportedAudioLengthOutput) &&
                double.TryParse(
                    reportedAudioLengthOutput,
                    System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture,
                    out var durationSeconds))
            {
                return TimeSpan.FromSeconds(durationSeconds);
            }

            if (!string.IsNullOrWhiteSpace(errorOutput))
            {
                AnsiConsole.MarkupLine(
                    $"[yellow]ffprobe stderr (duration check): {Markup.Escape(errorOutput)}[/]");
            }
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine(
                $"[red]Error running ffprobe for duration: {Markup.Escape(ex.Message)}[/]");
        }

        // Parsing failed, or there was an error.
        return null;
    }
}