using System.Diagnostics;

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

        Console.WriteLine($"Executing: ffmpeg {ffmpegArgs}");

        using var process = new Process { StartInfo = startInfo };

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
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("ffmpeg Error Output:");
                Console.WriteLine(error);
                Console.ResetColor();
                throw new Exception($"ffmpeg process failed with exit code {process.ExitCode}. See console output for details.");
            }

            // Optional
            // Console.WriteLine("ffmpeg Output:");
            // Console.WriteLine(output);
            // Console.WriteLine("ffmpeg Error (info usually):");
            // Console.WriteLine(error);
        }
        catch (Exception ex)
        {
            // Catch errors e.g. 'ffmpeg not found'
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"Failed to run ffmpeg. Is ffmpeg installed and in the system's PATH?");
            Console.WriteLine(ex.Message);
            Console.ResetColor();
            throw new Exception("FFmpeg execution failed.", ex);
        }
    }

}