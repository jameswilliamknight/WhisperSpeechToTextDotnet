using System.Diagnostics;
using Spectre.Console;

namespace WhisperPrototype;

public class AudioConverter : IAudioConverter
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
            FileName = "ffmpeg", // Assumes ffmpeg is in the system's PATH
            Arguments = ffmpegArgs,
            UseShellExecute = false,
            RedirectStandardOutput = true, // Redirect output for potential debugging info
            RedirectStandardError = true,  // Redirect errors
            CreateNoWindow = true          // Don't create a visible window (for console app)
        };

        AnsiConsole.WriteLine($"Executing: ffmpeg {ffmpegArgs}");

        using var process = new Process();
        process.StartInfo = startInfo;

        try
        {
            process.Start();

            // Read output/error streams to prevent deadlocks
            var output = process.StandardOutput.ReadToEnd();
            var error = process.StandardError.ReadToEnd();

            process.WaitForExit();

            if (process.ExitCode != 0)
            {
                // If ffmpeg returns a non-zero exit code, it means an error occurred
                AnsiConsole.MarkupLine("[red]ffmpeg Error Output:[/]");
                AnsiConsole.MarkupLine($"[red]{error}[/]");
                throw new Exception($"ffmpeg process failed with exit code {process.ExitCode}. See console output for details.");
            }

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

}