using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Spectre.Console;
using Whisper.net;
using WhisperPrototype.Hardware; // For IAudioConverter
using System.Threading;
using NAudio.Wave;
using WhisperPrototype.Events;
using WhisperPrototype.Providers;

namespace WhisperPrototype.Framework;

public class TranscriptionService : ITranscriptionService
{
    public async Task TranscribeFileAsync(
        FileInfo audioFileInfo,
        WhisperProcessor processor,
        string modelName,
        string outputDirectory,
        IAudioConverter audioConverter,
        string tempDirectoryPath)
    {
        var audioFilePath = audioFileInfo.FullName;
        var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(audioFilePath);

        if (!Directory.Exists(outputDirectory))
        {
            Directory.CreateDirectory(outputDirectory);
        }

        if (!string.IsNullOrEmpty(tempDirectoryPath) && !Directory.Exists(tempDirectoryPath))
        {
            try
            {
                Directory.CreateDirectory(tempDirectoryPath);
                AnsiConsole.MarkupLine($"[grey]Created temporary directory: {Markup.Escape(tempDirectoryPath)}[/]");
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine($"[red]Error creating temporary directory {Markup.Escape(tempDirectoryPath)}: {Markup.Escape(ex.Message)}[/]");
                // Fallback or re-throw depending on desired behavior. For now, we proceed, Path.Combine might fail.
            }
        }

        var outputTxtFilePath =
            Path.Combine(outputDirectory, $"{fileNameWithoutExtension}_{modelName}.txt");
        
        var tempWavFilePath = Path.Combine(tempDirectoryPath, $"{Guid.NewGuid()}.wav");

        AnsiConsole.MarkupLine($"\nProcessing: [blue]{Markup.Escape(audioFileInfo.Name)}[/]");

        if (File.Exists(outputTxtFilePath))
        {
            AnsiConsole.MarkupLine($"Output file already exists: [yellow]{Markup.Escape(outputTxtFilePath)}[/].");
            var overwrite = await AnsiConsole.ConfirmAsync("Do you want to overwrite it?", defaultValue: false);
            if (overwrite)
            {
                AnsiConsole.MarkupLine($"Deleting existing file: [yellow]{Markup.Escape(outputTxtFilePath)}[/]");
                File.Delete(outputTxtFilePath);
            }
            else
            {
                AnsiConsole.MarkupLine($"Skipping processing for: [blue]{Markup.Escape(audioFileInfo.Name)}[/]");
                return;
            }
        }

        try
        {
            AnsiConsole.MarkupLine("Converting MP3 to WAV using ffmpeg...");
            audioConverter.ToWav(audioFilePath, tempWavFilePath);
            AnsiConsole.MarkupLine("Conversion complete.");
            AnsiConsole.MarkupLine("Starting transcription...");

            if (!File.Exists(tempWavFilePath))
            {
                throw new FileNotFoundException(
                    $"ffmpeg failed to create the temporary WAV file: {tempWavFilePath}");
            }

            var sw = new Stopwatch();
            sw.Start();

            await using var audioStream = File.OpenRead(tempWavFilePath);
            var transcription = new StringBuilder();

            await foreach (var segment in processor.ProcessAsync(audioStream))
            {
                transcription.Append(segment.Text);
            }

            sw.Stop();

            var audioDuration = FFmpegWrapper.GetAudioDuration(tempWavFilePath);
            if (audioDuration == null)
            {
                AnsiConsole.MarkupLine("[red]Error:[/] Could not determine audio duration for calculations.");
            }
            else
            {
                var ratio = sw.Elapsed.TotalSeconds / audioDuration.Value.TotalSeconds;
                var audioDurationText = audioDuration.Value.TotalSeconds.ToString("F2");
                var elapsedText = sw.Elapsed.TotalSeconds.ToString("F2");
                var ratioText = ratio.ToString("F2");
                var speedColor = ratio < 1 ? "green" : "red";
                var speedDetailsMarkup = $"[bold {speedColor}]{ratioText}x speed[/]";
                AnsiConsole.MarkupLine(
                    $"Transcription of [green]{audioDurationText}s[/] audio completed in [yellow]{elapsedText}s[/] ({speedDetailsMarkup})."
                );
            }

            await File.WriteAllTextAsync(outputTxtFilePath, transcription.ToString());
            AnsiConsole.MarkupLine($"Transcription saved to: [yellow]{Markup.Escape(outputTxtFilePath)}[/]");
            AnsiConsole.WriteLine(transcription.ToString());
            AnsiConsole.MarkupLine($"--- END OF TRANSCRIPTION FOR {Markup.Escape(audioFileInfo.Name)} ---");
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine(
                $"[red]Error processing {Markup.Escape(audioFileInfo.Name)}:[/] {Markup.Escape(ex.Message)}");
        }
        finally
        {
            if (File.Exists(tempWavFilePath))
            {
                File.Delete(tempWavFilePath);
            }
        }
    }

    public async Task TranscribeAllFilesAsync(
        IEnumerable<FileInfo> audioFiles,
        WhisperProcessor processor,
        string modelName,
        string outputDirectory,
        IAudioConverter audioConverter,
        string tempDirectoryPath)
    {
        foreach (var audioFileInfo in audioFiles)
        {
            await TranscribeFileAsync(audioFileInfo, processor, modelName, outputDirectory, audioConverter, tempDirectoryPath);
        }
        AnsiConsole.MarkupLine("\nAll files processed.");
    }

    public async Task StartLiveTranscriptionAsync(
        string modelPath,
        FeatureToggles featureToggles,
        IAudioCaptureService audioCaptureService,
        Func<AudioInputDevice, Task<AudioInputDevice>> selectInputDeviceAsync, // For device selection UI
        Action<string> onSegmentTranscribed, // Callback for real-time segment display
        string? outputDirectory,
        string modelName,
        CancellationToken cancellationToken)
    {
        AnsiConsole.MarkupLine("[cyan]Starting live transcription...[/]");
        AnsiConsole.MarkupLine("[grey]Initializing Whisper.net factory and processor...[/]");

        using var whisperFactory = WhisperFactory.FromPath(modelPath);
        await using var processor = whisperFactory.CreateBuilder()
            .WithLanguage("en")
            .Build();

        AnsiConsole.MarkupLine($"[green]Whisper.net ready with language: en[/]");

        var desiredFormat = new WaveFormat(16000, 16, 1); // PCM, 16kHz, 16-bit, Mono

        var availableDevices = (await audioCaptureService.GetAvailableDevicesAsync()).ToList();
        if (!availableDevices.Any())
        {
            AnsiConsole.MarkupLine(
                "[yellow]No audio input devices found. Please ensure a microphone is connected and configured.[/]");
            // The caller (Workspace) will handle disposal of audioCaptureService if needed
            return;
        }

        AudioInputDevice selectedInputDevice;
        if (availableDevices.Count == 1)
        {
            selectedInputDevice = availableDevices.First();
            AnsiConsole.MarkupLine($"[green]Using default device: {Markup.Escape(selectedInputDevice.Name)}[/]");
        }
        else
        {
            // Use the callback to let the Workspace handle the UI for device selection
            var firstDevice = availableDevices.First(); // Provide a default or placeholder
            selectedInputDevice = await selectInputDeviceAsync(firstDevice); // The workspace will show its own prompt
            AnsiConsole.MarkupLine($"[green]Using device: {Markup.Escape(selectedInputDevice.Name)}[/]");
        }

        var audioBuffer = new MemoryStream();
        var transcriptionBuffer = new StringBuilder();

        const float desiredChunkDurationSeconds = 2.0f;
        const int bytesPerSample = 2; // 16-bit audio
        const int channels = 1; // Mono audio
        const int sampleRate = 16000; // 16kHz
        const int bytesPerSecond = sampleRate * bytesPerSample * channels;
        const int processThresholdInBytes = (int)(bytesPerSecond * desiredChunkDurationSeconds);

        Func<object, AudioDataAvailableEventArgs, Task> audioDataHandler = async (_, args) =>
        {
            if (args.BytesRecorded <= 0) return;
            await audioBuffer.WriteAsync(args.Buffer, 0, args.BytesRecorded);
            if (featureToggles.LogAudioDataReceivedMessages)
            {
                AnsiConsole.MarkupLine(
                    $"[grey]Live: Received {args.BytesRecorded} audio bytes. " +
                    $"Buffer size: {audioBuffer.Length} bytes.[/]");
            }
        };
        audioCaptureService.AudioDataAvailable += (sender, args) => { audioDataHandler(sender, args); };

        try
        {
            await audioCaptureService.StartCaptureAsync(selectedInputDevice.Id, desiredFormat);
            AnsiConsole.MarkupLine("[green]Audio capture started. Press [yellow]ESC[/] to stop (in console).[/]");

            while (!cancellationToken.IsCancellationRequested)
            {
                if (audioBuffer.Length >= processThresholdInBytes)
                {
                    if (featureToggles.LogProcessingChunkMessages)
                        AnsiConsole.MarkupLine($"[cyan]Processing audio chunk of {audioBuffer.Length} bytes...[/]");
                    audioBuffer.Seek(0, SeekOrigin.Begin);

                    var tempBuffer = new byte[audioBuffer.Length];
                    await audioBuffer.ReadAsync(tempBuffer, 0, tempBuffer.Length);
                    audioBuffer.SetLength(0);
                    audioBuffer.Seek(0, SeekOrigin.Begin);

                    int numSamples = tempBuffer.Length / bytesPerSample;
                    float[] floatSamples = new float[numSamples];
                    for (int i = 0; i < numSamples; i++)
                    {
                        short pcmSample = BitConverter.ToInt16(tempBuffer, i * bytesPerSample);
                        floatSamples[i] = pcmSample / 32768.0f;
                    }

                    try
                    {
                        if (featureToggles.EnableDiagnosticLogging)
                            AnsiConsole.MarkupLine("[yellow]DEBUG: About to call processor.ProcessAsync...[/]");
                        bool segmentReceived = false;
                        await foreach (var segment in processor.ProcessAsync(floatSamples).WithCancellation(cancellationToken))
                        {
                            segmentReceived = true;
                            if (featureToggles.EnableDiagnosticLogging)
                            {
                                var segmentTextForLog = segment.Text ?? "<null_or_empty>";
                                AnsiConsole.MarkupLine(
                                    $"[yellow]DEBUG: Segment received from Whisper: '{Markup.Escape(segmentTextForLog)}' (Length: {segmentTextForLog.Length})[/]");
                            }
                            if (!string.IsNullOrWhiteSpace(segment.Text))
                            {
                                transcriptionBuffer.Append(segment.Text); // Append raw text
                                onSegmentTranscribed(segment.Text); // Invoke callback with raw text
                            }
                            else
                            {
                                if (featureToggles.EnableDiagnosticLogging)
                                    AnsiConsole.MarkupLine(
                                        "[yellow]DEBUG: Segment text is null or whitespace, not invoking callback.[/]");
                            }
                        }
                        if (!segmentReceived && featureToggles.EnableDiagnosticLogging)
                        {
                            AnsiConsole.MarkupLine(
                                "[yellow]DEBUG: processor.ProcessAsync completed without yielding any segments.[/]");
                        }
                    }
                    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                    {
                        AnsiConsole.MarkupLine("[yellow]Transcription processing canceled.[/]");
                        break; // Exit the loop if canceled during ProcessAsync
                    }
                    catch (Exception ex)
                    {
                        AnsiConsole.MarkupLine($"[red]Error during transcription processing chunk: {Markup.Escape(ex.Message)}[/]");
                    }
                }
                try
                {
                    await Task.Delay(100, cancellationToken); // Prevent tight loop, honor cancellation
                }
                catch (OperationCanceledException)
                {
                    AnsiConsole.MarkupLine("[yellow]Task.Delay canceled during live transcription loop.[/]");
                    break; // Exit loop if Task.Delay is canceled
                }
            }

            if (cancellationToken.IsCancellationRequested)
            {
                AnsiConsole.MarkupLine("[yellow]Live transcription cancellation requested.[/]");
            }
        }
        catch (OperationCanceledException) // Catches cancellation from StartCaptureAsync or before the loop
        {
            AnsiConsole.MarkupLine("[yellow]Live transcription was canceled.[/]");
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]Error during live transcription: {Markup.Escape(ex.Message)}[/]");
        }
        finally
        {
            AnsiConsole.MarkupLine("[cyan]Stopping audio capture (within TranscriptionService)...[/]");
            // StopCaptureAsync and DisposeAsync for audioCaptureService should be managed by the caller (Workspace)
            // as it created and owns the service instance.

            AnsiConsole.MarkupLine("[green]Audio capture processing finished in TranscriptionService.[/]");
            AnsiConsole.WriteLine(); // Ensure a newline before final summary
            AnsiConsole.MarkupLine("[bold green]Live Transcription Complete (within TranscriptionService):[/]");
            AnsiConsole.WriteLine(transcriptionBuffer.ToString());

            if (outputDirectory != null && transcriptionBuffer.Length > 0)
            {
                if (!Directory.Exists(outputDirectory))
                {
                    Directory.CreateDirectory(outputDirectory);
                }
                var transcriptPath = Path.Combine(
                    outputDirectory,
                    $"LiveTranscript_{DateTime.Now:yyyyMMddHHmmss}_{modelName}.txt");
                try
                {
                    await File.WriteAllTextAsync(transcriptPath, transcriptionBuffer.ToString());
                    AnsiConsole.MarkupLine($"[green]Full transcript saved to: {Markup.Escape(transcriptPath)}[/]");
                }
                catch (Exception ex)
                {
                    AnsiConsole.MarkupLine($"[red]Error saving transcript: {Markup.Escape(ex.Message)}[/]");
                }
            }
        }
    }
}