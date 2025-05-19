using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json; // For serializing AudioSegment list
using System.Threading.Tasks;
using Spectre.Console;
using Whisper.net;
using WhisperPrototype.Hardware; // For IAudioConverter
using System.Threading;
using NAudio.Wave;
using WhisperPrototype.Events;
using WhisperPrototype.Providers;

namespace WhisperPrototype.Framework;

public class TranscriptionService(
    IAudioChunker audioChunker,
    IAudioSegmentProcessor segmentProcessor,
    AppSettings appSettings)
    : ITranscriptionService
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
        var originalFileNameForLogging = Markup.Escape(audioFileInfo.Name);

        AnsiConsole.MarkupLine($"\n[bold blue]TRANSCRIPTION SERVICE: Starting process for {originalFileNameForLogging}[/]");

        if (!Directory.Exists(outputDirectory))
        {
            Directory.CreateDirectory(outputDirectory);
            AnsiConsole.MarkupLine($"[grey]   Created output directory: {Markup.Escape(outputDirectory)}[/]");
        }

        if (!string.IsNullOrEmpty(tempDirectoryPath) && !Directory.Exists(tempDirectoryPath))
        {
            try
            {
                Directory.CreateDirectory(tempDirectoryPath);
                AnsiConsole.MarkupLine($"[grey]   Created temporary directory: {Markup.Escape(tempDirectoryPath)}[/]");
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine($"[red]   Error creating temporary directory {Markup.Escape(tempDirectoryPath)}: {Markup.Escape(ex.Message)}[/]");
                // Decide on fallback or re-throw. For now, let it proceed, Path.Combine might fail or subsequent ops.
            }
        }

        var outputTxtFilePath =
            Path.Combine(outputDirectory, $"{fileNameWithoutExtension}_{modelName}.txt");
        var tempWavFilePath = Path.Combine(tempDirectoryPath, $"{fileNameWithoutExtension}_full_temp.wav"); // Made temp WAV name more specific

        if (File.Exists(outputTxtFilePath))
        {
            AnsiConsole.MarkupLine($"[yellow]   Output file already exists: {Markup.Escape(outputTxtFilePath)}[/].");
            var overwrite = await AnsiConsole.ConfirmAsync("   Do you want to overwrite it?", defaultValue: false);
            if (overwrite)
            {
                AnsiConsole.MarkupLine($"[grey]   Deleting existing output file: {Markup.Escape(outputTxtFilePath)}[/]");
                File.Delete(outputTxtFilePath);
            }
            else
            {
                AnsiConsole.MarkupLine($"[cyan]   Skipping processing for: {originalFileNameForLogging}[/]");
                return;
            }
        }
        
        // Path for storing the detected audio segments as JSON
        var segmentsJsonFilePath = Path.ChangeExtension(tempWavFilePath, ".segments.json");

        try
        {
            AnsiConsole.MarkupLine($"[cyan]   Step 1: Converting to WAV for {originalFileNameForLogging}...[/]");
            AnsiConsole.MarkupLine($"[grey]     Source: {Markup.Escape(audioFilePath)}[/]");
            AnsiConsole.MarkupLine($"[grey]     Target Temp WAV: {Markup.Escape(tempWavFilePath)}[/]");
            audioConverter.ToWav(audioFilePath, tempWavFilePath);
            AnsiConsole.MarkupLine("[green]     Conversion to WAV complete.[/]");

            if (!File.Exists(tempWavFilePath))
            {
                throw new FileNotFoundException($"Audio conversion failed to create the temporary WAV file: {tempWavFilePath}");
            }

            AnsiConsole.MarkupLine($"[cyan]   Step 2: Detecting speech segments for {originalFileNameForLogging}...[/]");
            var vadParameters = new VADParameters // Populate from AppSettings
            {
                SilenceDetectionNoiseDb = appSettings.SilenceDetectionNoiseDb,
                MinSilenceDurationSeconds = appSettings.MinSilenceDurationSeconds,
                MinSpeechSegmentSeconds = appSettings.MinSpeechSegmentSeconds,
                SegmentPaddingSeconds = appSettings.SegmentPaddingSeconds
            };
            List<AudioSegment> speechSegments = await audioChunker.DetectSpeechSegmentsAsync(tempWavFilePath, vadParameters);

            // Serialize and save the detected segments to JSON
            try
            {
                var jsonOptions = new JsonSerializerOptions { WriteIndented = true };
                var segmentsJson = JsonSerializer.Serialize(speechSegments, jsonOptions);
                await File.WriteAllTextAsync(segmentsJsonFilePath, segmentsJson);
                AnsiConsole.MarkupLine($"[green]   Detected segments saved to: {Markup.Escape(segmentsJsonFilePath)}[/]");
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine($"[yellow]   Warning: Could not save detected segments to JSON ({Markup.Escape(segmentsJsonFilePath)}): {Markup.Escape(ex.Message)}[/]");
            }

            if (!speechSegments.Any())
            {
                AnsiConsole.MarkupLine($"[yellow]   No speech segments detected for {originalFileNameForLogging}. Transcription will be empty.[/]");
                await File.WriteAllTextAsync(outputTxtFilePath, string.Empty); // Create an empty transcription file
                AnsiConsole.MarkupLine($"[green]   Empty transcription saved to: {Markup.Escape(outputTxtFilePath)}[/]");
                return;
            }

            AnsiConsole.MarkupLine($"[cyan]   Step 3: Transcribing {speechSegments.Count} speech segment(s) for {originalFileNameForLogging}...[/]");
            var overallTranscription = new StringBuilder();
            var overallStopwatch = Stopwatch.StartNew();
            double totalAudioProcessedDurationSeconds = 0;

            for (var i = 0; i < speechSegments.Count; i++)
            {
                var segment = speechSegments[i];
                // Determine the output path for this specific segment's transcript
                var outputDirectoryName = Path.GetDirectoryName(outputTxtFilePath);
                var baseOutputFileName = Path.GetFileNameWithoutExtension(outputTxtFilePath); // e.g., "myaudio_ggml-medium.en.bin"
                var segmentTxtFileName = $"{baseOutputFileName}_segment-{i + 1:D4}.txt";
                var segmentTxtFilePath = Path.Combine(outputDirectoryName ?? string.Empty, segmentTxtFileName);
                
                bool firstResultInSegment = true; // To manage Write vs Append for the segment file

                AnsiConsole.MarkupLine($"[blue]     Transcribing segment {i + 1}/{speechSegments.Count}: {segment.StartTime:g} to {segment.EndTime:g} (Duration: {segment.Duration:g})[/]");
                var segmentStopwatch = Stopwatch.StartNew();
                try
                {
                    // Get stream for the current segment
                    await using var segmentStream = await segmentProcessor.GetSegmentStreamAsync(tempWavFilePath, segment, i, speechSegments.Count);

                    if (segmentStream == Stream.Null || segmentStream.Length == 0) 
                    { 
                        AnsiConsole.MarkupLine($"[yellow]     Segment {i+1} stream is null or empty, skipping transcription for this segment.[/]");
                        continue; 
                    }

                    await foreach (var result in processor.ProcessAsync(segmentStream))
                    {
                        overallTranscription.Append(result.Text);
                        // No longer using currentSegmentTranscription

                        if (!string.IsNullOrWhiteSpace(result.Text))
                        {
                            var textToSaveAndPrint = result.Text.Trim();
                            AnsiConsole.MarkupLine($"[#8B8000]       Segment text: {Markup.Escape(textToSaveAndPrint)}[/]");

                            // Write/Append this part to the segment's transcript file
                            if (firstResultInSegment)
                            {
                                await File.WriteAllTextAsync(segmentTxtFilePath, textToSaveAndPrint + Environment.NewLine);
                                firstResultInSegment = false;
                            }
                            else
                            {
                                await File.AppendAllTextAsync(segmentTxtFilePath, textToSaveAndPrint + Environment.NewLine);
                            }
                        }
                    }

                    // The block for saving currentSegmentTranscription is removed from here.
                    // Logging of individual segment file saving is also removed as it's implicit with the console print.

                    totalAudioProcessedDurationSeconds += segment.Duration.TotalSeconds;
                    segmentStopwatch.Stop();
                    AnsiConsole.MarkupLine($"[green]     Segment {i + 1} transcribed in {segmentStopwatch.ElapsedMilliseconds}ms. Appended to main transcript.[/]");
                }
                catch (Exception ex)
                {
                    segmentStopwatch.Stop();
                    AnsiConsole.MarkupLine($"[red]     Error transcribing segment {i + 1} ({segment.StartTime:g}-{segment.EndTime:g}): {Markup.Escape(ex.Message)}[/]");
                    AnsiConsole.MarkupLine($"[yellow]     Skipping this segment, continuing with others if any.[/]");
                }
            }

            overallStopwatch.Stop();
            AnsiConsole.MarkupLine($"[green]   All segments transcribed for {originalFileNameForLogging}.[/]");
            
            var audioDuration = TimeSpan.FromSeconds(totalAudioProcessedDurationSeconds); // Sum of processed segment durations
            var ratio = overallStopwatch.Elapsed.TotalSeconds / audioDuration.TotalSeconds;
            var audioDurationText = audioDuration.TotalSeconds.ToString("F2");
            var elapsedText = overallStopwatch.Elapsed.TotalSeconds.ToString("F2");
            var ratioText = ratio.ToString("F2");
            var speedColor = ratio < 1 ? "green" : "red";
            var speedDetailsMarkup = $"[bold {speedColor}]{ratioText}x speed[/]";

            AnsiConsole.MarkupLine(
                $"[green]   Transcription of {speechSegments.Count} segments (total speech: {audioDurationText}s) completed in {elapsedText}s ({speedDetailsMarkup}).[/]"
            );

            await File.WriteAllTextAsync(outputTxtFilePath, overallTranscription.ToString().Trim());
            AnsiConsole.MarkupLine($"[green]   Full transcription saved to: {Markup.Escape(outputTxtFilePath)}[/]");
            AnsiConsole.WriteLine(Markup.Escape(overallTranscription.ToString().Trim()));
            AnsiConsole.MarkupLine($"--- END OF TRANSCRIPTION FOR {originalFileNameForLogging} ---");
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine(
                $"[red]TRANSCRIPTION SERVICE: Error processing {originalFileNameForLogging}: {Markup.Escape(ex.Message)}[/]");
             // Optionally print stack trace for debugging: AnsiConsole.WriteException(ex);
        }
        finally
        {
            // Delete the main temporary WAV file (segment temp files are deleted on close by FFmpegAudioSegmentProcessor)
            if (File.Exists(tempWavFilePath))
            {
                try
                {
                    File.Delete(tempWavFilePath);
                    AnsiConsole.MarkupLine($"[grey]   Cleaned up main temporary WAV file: {Markup.Escape(tempWavFilePath)}[/]");
                }
                catch (IOException ioEx)
                {
                    AnsiConsole.MarkupLine($"[yellow]   Warning: Could not delete main temporary WAV file {Markup.Escape(tempWavFilePath)}: {Markup.Escape(ioEx.Message)}[/]");
                }
            }
            // The .segments.json file is intentionally kept for inspection.
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
        AnsiConsole.MarkupLine($"\n[bold blue]TRANSCRIPTION SERVICE: Starting batch transcription for {audioFiles.Count()} file(s).[/]");
        foreach (var audioFileInfo in audioFiles)
        {
            await TranscribeFileAsync(audioFileInfo, processor, modelName, outputDirectory, audioConverter, tempDirectoryPath);
        }
        AnsiConsole.MarkupLine("[bold blue]TRANSCRIPTION SERVICE: All files processed.[/]");
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
            //.WithCuda()
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

                    var numSamples = tempBuffer.Length / bytesPerSample;
                    var floatSamples = new float[numSamples];
                    for (var k = 0; k < numSamples; k++)
                    {
                        var pcmSample = BitConverter.ToInt16(tempBuffer, k * bytesPerSample);
                        floatSamples[k] = pcmSample / 32768.0f;
                    }

                    try
                    {
                        if (featureToggles.EnableDiagnosticLogging)
                            AnsiConsole.MarkupLine("[yellow]DEBUG: About to call processor.ProcessAsync...[/]");
                        var segmentReceived = false;
                        await foreach (var segmentData in processor.ProcessAsync(floatSamples).WithCancellation(cancellationToken))
                        {
                            segmentReceived = true;
                            if (featureToggles.EnableDiagnosticLogging)
                            {
                                var segmentTextForLog = segmentData.Text ?? "<null_or_empty>";
                                AnsiConsole.MarkupLine(
                                    $"[yellow]DEBUG: Segment received from Whisper: '{Markup.Escape(segmentTextForLog)}' (Length: {segmentTextForLog.Length})[/]");
                            }
                            if (!string.IsNullOrWhiteSpace(segmentData.Text))
                            {
                                transcriptionBuffer.Append(segmentData.Text); 
                                onSegmentTranscribed(segmentData.Text); 
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
                        break; 
                    }
                    catch (Exception ex)
                    {
                        AnsiConsole.MarkupLine($"[red]Error during transcription processing chunk: {Markup.Escape(ex.Message)}[/]");
                    }
                }
                try
                {
                    await Task.Delay(100, cancellationToken); 
                }
                catch (OperationCanceledException)
                {
                    AnsiConsole.MarkupLine("[yellow]Task.Delay canceled during live transcription loop.[/]");
                    break; 
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