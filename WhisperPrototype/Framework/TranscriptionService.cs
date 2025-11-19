using System.Diagnostics;
using System.Text;
using System.Text.Json; // For serializing AudioSegment list
using Spectre.Console;
using Whisper.net;
using WhisperPrototype.Hardware; // For IAudioConverter
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

        if (appSettings.Verbosity >= VerbosityLevel.Normal)
        {
            AnsiConsole.MarkupLine($"\n[bold blue]Processing: {originalFileNameForLogging}[/]");
        }

        if (!Directory.Exists(outputDirectory))
        {
            Directory.CreateDirectory(outputDirectory);
            if (appSettings.Verbosity >= VerbosityLevel.Debug)
            {
                AnsiConsole.MarkupLine($"[grey]   Created output directory: {Markup.Escape(outputDirectory)}[/]");
            }
        }

        if (!string.IsNullOrEmpty(tempDirectoryPath) && !Directory.Exists(tempDirectoryPath))
        {
            try
            {
                Directory.CreateDirectory(tempDirectoryPath);
                if (appSettings.Verbosity >= VerbosityLevel.Debug)
                {
                    AnsiConsole.MarkupLine($"[grey]   Created temp directory: {Markup.Escape(tempDirectoryPath)}[/]");
                }
            }
            catch (Exception ex)
            {
                AnsiConsole.MarkupLine($"[red]   Error creating temp directory: {Markup.Escape(ex.Message)}[/]");
            }
        }

        var outputTxtFilePath =
            Path.Combine(outputDirectory, $"{fileNameWithoutExtension}_{modelName}.txt");

        // Create a workspace directory specific to this file
        var workspaceDirectory = Path.Combine(tempDirectoryPath, $"{fileNameWithoutExtension}_workspace");
        try
        {
            if (!Directory.Exists(workspaceDirectory))
            {
                Directory.CreateDirectory(workspaceDirectory);
            }
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]   Error creating workspace directory {Markup.Escape(workspaceDirectory)}: {Markup.Escape(ex.Message)}[/]");
            throw; // Cannot proceed without workspace
        }

        var tempWavFilePath = Path.Combine(workspaceDirectory, $"{fileNameWithoutExtension}_full_temp.wav");
        
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

        var transcriptionSuccessful = false;
        try
        {
            if (appSettings.Verbosity >= VerbosityLevel.Normal)
            {
                AnsiConsole.MarkupLine($"[cyan]   Step 1: Converting to WAV...[/]");
            }
            
            if (appSettings.Verbosity >= VerbosityLevel.Debug)
            {
                AnsiConsole.MarkupLine($"[grey]     Source: {Markup.Escape(audioFilePath)}[/]");
                AnsiConsole.MarkupLine($"[grey]     Target: {Markup.Escape(tempWavFilePath)}[/]");
            }
            
            audioConverter.ToWav(audioFilePath, tempWavFilePath);
            
            if (appSettings.Verbosity >= VerbosityLevel.Verbose)
            {
                AnsiConsole.MarkupLine("[green]     Conversion complete[/]");
            }

            if (!File.Exists(tempWavFilePath))
            {
                throw new FileNotFoundException($"Audio conversion failed to create the temporary WAV file: {tempWavFilePath}");
            }

            // Step 2 title is now shown by audio chunker
            var vadParameters = new VADParameters
            {
                SilenceDetectionNoiseDb = appSettings.SilenceDetectionNoiseDb,
                MinSilenceDurationSeconds = appSettings.MinSilenceDurationSeconds,
                MinSpeechSegmentSeconds = appSettings.MinSpeechSegmentSeconds,
                SegmentPaddingSeconds = appSettings.SegmentPaddingSeconds
            };
            var speechSegments = await audioChunker.DetectSpeechSegmentsAsync(tempWavFilePath, vadParameters);

            // Serialize and save the detected segments to JSON
            try
            {
                var jsonOptions = new JsonSerializerOptions { WriteIndented = true };
                var segmentsJson = JsonSerializer.Serialize(speechSegments, jsonOptions);
                await File.WriteAllTextAsync(segmentsJsonFilePath, segmentsJson);
                if (appSettings.Verbosity >= VerbosityLevel.Debug)
                {
                    AnsiConsole.MarkupLine($"[green]   Segments saved to: {Markup.Escape(segmentsJsonFilePath)}[/]");
                }
            }
            catch (Exception ex)
            {
                if (appSettings.Verbosity >= VerbosityLevel.Verbose)
                {
                    AnsiConsole.MarkupLine($"[yellow]   Warning: Could not save segments JSON: {Markup.Escape(ex.Message)}[/]");
                }
            }

            if (!speechSegments.Any())
            {
                if (appSettings.Verbosity >= VerbosityLevel.Normal)
                {
                    AnsiConsole.MarkupLine($"[yellow]   No speech detected. Creating empty transcription.[/]");
                }
                await File.WriteAllTextAsync(outputTxtFilePath, string.Empty);
                return;
            }

            if (appSettings.Verbosity >= VerbosityLevel.Normal)
            {
                AnsiConsole.MarkupLine($"[cyan]   Step 3: Transcribing {speechSegments.Count} segment(s)...[/]");
            }
            var overallTranscription = new StringBuilder();
            var overallStopwatch = Stopwatch.StartNew();
            double totalAudioProcessedDurationSeconds = 0;

            for (var i = 0; i < speechSegments.Count; i++)
            {
                var segment = speechSegments[i];
                // Determine the output path for this specific segment's transcript
                // var outputDirectoryName = Path.GetDirectoryName(outputTxtFilePath); 
                var baseOutputFileName = Path.GetFileNameWithoutExtension(outputTxtFilePath); // e.g., "myaudio_ggml-medium.en.bin"
                var segmentTxtFileName = $"{baseOutputFileName}_segment-{i + 1:D4}.txt";
                // Store individual segment transcripts in the workspace directory for easier cleanup
                var segmentTxtFilePath = Path.Combine(workspaceDirectory, segmentTxtFileName);
                
                var firstResultInSegment = true; // To manage Write vs Append for the segment file

                if (appSettings.Verbosity >= VerbosityLevel.Verbose)
                {
                    AnsiConsole.MarkupLine($"[grey]     Segment {i + 1}/{speechSegments.Count}: {segment.StartTime:g} to {segment.EndTime:g}[/]");
                }
                
                var segmentStopwatch = Stopwatch.StartNew();
                try
                {
                    // Get stream for the current segment
                    await using var segmentStream = await segmentProcessor.GetSegmentStreamAsync(tempWavFilePath, segment, i, speechSegments.Count, workspaceDirectory);

                    if (segmentStream == Stream.Null || segmentStream.Length == 0) 
                    {
                        if (appSettings.Verbosity >= VerbosityLevel.Normal)
                        {
                            AnsiConsole.MarkupLine($"[yellow]     Warning: Segment {i+1} is empty, skipping.[/]");
                        }
                        continue; 
                    }

                    await foreach (var result in processor.ProcessAsync(segmentStream))
                    {
                        if (!string.IsNullOrWhiteSpace(result.Text))
                        {
                            var textToSaveAndPrint = result.Text.Trim();
                            
                            // Append to overall transcription (trimmed)
                            overallTranscription.AppendLine(textToSaveAndPrint);
                            
                            // Always show transcribed text in Quiet and above
                            if (appSettings.Verbosity >= VerbosityLevel.Quiet)
                            {
                                AnsiConsole.MarkupLine($"[yellow]{Markup.Escape(textToSaveAndPrint)}[/]");
                            }

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
                    
                    if (appSettings.Verbosity >= VerbosityLevel.Verbose)
                    {
                        AnsiConsole.MarkupLine($"[green]     Segment {i + 1} completed in {segmentStopwatch.ElapsedMilliseconds}ms[/]");
                    }
                }
                catch (Exception ex)
                {
                    segmentStopwatch.Stop();
                    AnsiConsole.MarkupLine($"[red]     Error in segment {i + 1}: {Markup.Escape(ex.Message)}[/]");
                    if (appSettings.Verbosity >= VerbosityLevel.Verbose)
                    {
                        AnsiConsole.MarkupLine($"[yellow]     Skipping segment and continuing...[/]");
                    }
                }
            }

            overallStopwatch.Stop();
            
            var audioDuration = TimeSpan.FromSeconds(totalAudioProcessedDurationSeconds);
            var ratio = overallStopwatch.Elapsed.TotalSeconds / audioDuration.TotalSeconds;
            var audioDurationText = audioDuration.TotalSeconds.ToString("F2");
            var elapsedText = overallStopwatch.Elapsed.TotalSeconds.ToString("F2");
            var ratioText = ratio.ToString("F2");
            var speedColor = ratio < 1 ? "green" : "red";

            if (appSettings.Verbosity >= VerbosityLevel.Normal)
            {
                AnsiConsole.MarkupLine($"[green]   Completed in {elapsedText}s ([{speedColor}]{ratioText}x speed[/])[/]");
            }

            await File.WriteAllTextAsync(outputTxtFilePath, overallTranscription.ToString().Trim());
            
            if (appSettings.Verbosity >= VerbosityLevel.Normal)
            {
                AnsiConsole.MarkupLine($"[green]   Saved to: {Markup.Escape(outputTxtFilePath)}[/]");
            }
            
            // Show full transcription text only in Verbose mode
            if (appSettings.Verbosity >= VerbosityLevel.Verbose)
            {
                AnsiConsole.WriteLine();
                AnsiConsole.MarkupLine("[cyan]Full transcription:[/]");
                AnsiConsole.WriteLine(Markup.Escape(overallTranscription.ToString().Trim()));
            }
            transcriptionSuccessful = true;
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLine($"[red]   Error: {Markup.Escape(ex.Message)}[/]");
            if (appSettings.Verbosity >= VerbosityLevel.Debug)
            {
                AnsiConsole.WriteException(ex);
            }
        }
        finally
        {
            if (transcriptionSuccessful)
            {
                try
                {
                    if (Directory.Exists(workspaceDirectory))
                    {
                        Directory.Delete(workspaceDirectory, true);
                        if (appSettings.Verbosity >= VerbosityLevel.Debug)
                        {
                            AnsiConsole.MarkupLine($"[grey]   Cleaned up temp files[/]");
                        }
                    }
                }
                catch (Exception ex)
                {
                    if (appSettings.Verbosity >= VerbosityLevel.Verbose)
                    {
                        AnsiConsole.MarkupLine($"[yellow]   Warning: Could not delete temp files: {Markup.Escape(ex.Message)}[/]");
                    }
                }
            }
            else
            {
                if (appSettings.Verbosity >= VerbosityLevel.Normal)
                {
                    AnsiConsole.MarkupLine($"[yellow]   Transcription incomplete. Temp files preserved in: {Markup.Escape(workspaceDirectory)}[/]");
                }
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
        var filesList = audioFiles.ToList();
        
        if (appSettings.Verbosity >= VerbosityLevel.Normal)
        {
            AnsiConsole.MarkupLine($"\n[bold blue]Starting batch transcription ({filesList.Count} file(s))[/]");
        }
        
        await AnsiConsole.Progress()
            .AutoClear(false)
            .Columns(
                new TaskDescriptionColumn(),
                new ProgressBarColumn(),
                new PercentageColumn(),
                new SpinnerColumn())
            .StartAsync(async ctx =>
            {
                var task = ctx.AddTask("[yellow]Processing files[/]", maxValue: filesList.Count);
                
                for (int i = 0; i < filesList.Count; i++)
                {
                    var audioFileInfo = filesList[i];
                    task.Description = $"[yellow]({i + 1}/{filesList.Count}) {Markup.Escape(audioFileInfo.Name)}[/]";
                    
                    await TranscribeFileAsync(audioFileInfo, processor, modelName, outputDirectory, audioConverter, tempDirectoryPath);
                    
                    task.Increment(1);
                }
                
                task.Description = "[green]All files processed[/]";
            });
        
        if (appSettings.Verbosity >= VerbosityLevel.Normal)
        {
            AnsiConsole.MarkupLine("[bold green]Batch transcription complete![/]");
        }
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

        // Prepare output file path and display it prominently
        string? transcriptPath = null;
        if (outputDirectory != null && !string.IsNullOrWhiteSpace(outputDirectory))
        {
            if (!Directory.Exists(outputDirectory))
            {
                Directory.CreateDirectory(outputDirectory);
            }
            transcriptPath = Path.Combine(
                outputDirectory,
                $"Live_{DateTime.Now:yyyyMMdd_HHmmss}_{modelName}.txt");
            
            AnsiConsole.WriteLine();
            AnsiConsole.Write(new Rule("[yellow]Output Location[/]"));
            AnsiConsole.MarkupLine($"[cyan]Transcription will be saved to:[/]");
            AnsiConsole.MarkupLine($"  [yellow]{Markup.Escape(transcriptPath)}[/]");
            AnsiConsole.Write(new Rule());
            AnsiConsole.WriteLine();
        }

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

        // Overlapping window configuration
        const float windowDurationSeconds = 10.0f;
        const float advanceIntervalSeconds = 2.0f;
        const int bytesPerSample = 2; // 16-bit audio
        const int channels = 1; // Mono audio
        const int sampleRate = 16000; // 16kHz
        const int bytesPerSecond = sampleRate * bytesPerSample * channels;
        const int windowSizeInBytes = (int)(bytesPerSecond * windowDurationSeconds);
        const int advanceIntervalBytes = (int)(bytesPerSecond * advanceIntervalSeconds);

        var circularBuffer = new CircularAudioBuffer(windowSizeInBytes);
        var transcriptionBuffer = new StringBuilder();
        var previousTranscription = string.Empty;
        int bytesProcessedSinceLastWindow = 0;

        Func<object?, AudioDataAvailableEventArgs, Task> audioDataHandler = async (_, args) =>
        {
            if (args.BytesRecorded <= 0) return;
            await Task.Run(() => circularBuffer.Write(args.Buffer, 0, args.BytesRecorded), cancellationToken);
            bytesProcessedSinceLastWindow += args.BytesRecorded;
            if (featureToggles.LogAudioDataReceivedMessages)
            {
                AnsiConsole.MarkupLine(
                    $"[grey]Live: Received {args.BytesRecorded} audio bytes. " +
                    $"Buffer: {circularBuffer.AvailableBytes}/{windowSizeInBytes} bytes, " +
                    $"Since last window: {bytesProcessedSinceLastWindow}/{advanceIntervalBytes}[/]");
            }
        };
        audioCaptureService.AudioDataAvailable += (sender, args) => { audioDataHandler(sender, args); };

        try
        {
            await audioCaptureService.StartCaptureAsync(selectedInputDevice.Id, desiredFormat);
            AnsiConsole.MarkupLine("[green]Audio capture started. Press [yellow]ESC[/] to stop (in console).[/]");

            while (!cancellationToken.IsCancellationRequested)
            {
                // Check if we have enough audio data and have advanced enough since last window
                if (circularBuffer.AvailableBytes >= windowSizeInBytes && 
                    bytesProcessedSinceLastWindow >= advanceIntervalBytes)
                {
                    bytesProcessedSinceLastWindow = 0;
                    
                    if (featureToggles.LogProcessingChunkMessages)
                        AnsiConsole.MarkupLine($"[cyan]Processing 10s audio window ({windowSizeInBytes} bytes)...[/]");

                    // Get the complete window from circular buffer
                    var windowBytes = circularBuffer.ReadAll();

                    // Convert to float samples
                    var numSamples = windowBytes.Length / bytesPerSample;
                    var floatSamples = new float[numSamples];
                    for (var k = 0; k < numSamples; k++)
                    {
                        var pcmSample = BitConverter.ToInt16(windowBytes, k * bytesPerSample);
                        floatSamples[k] = pcmSample / 32768.0f;
                    }

                    try
                    {
                        if (featureToggles.EnableDiagnosticLogging)
                            AnsiConsole.MarkupLine("[yellow]DEBUG: About to call processor.ProcessAsync...[/]");
                        
                        var windowTranscription = new StringBuilder();
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
                                windowTranscription.Append(segmentData.Text.Trim());
                                windowTranscription.Append(" ");
                            }
                            else
                            {
                                if (featureToggles.EnableDiagnosticLogging)
                                    AnsiConsole.MarkupLine(
                                        "[yellow]DEBUG: Segment text is null or whitespace, not invoking callback.[/]");
                            }
                        }
                        
                        if (segmentReceived && windowTranscription.Length > 0)
                        {
                            var currentText = windowTranscription.ToString().Trim();
                            var stitchedText = StitchTranscriptionSegments(previousTranscription, currentText);
                            
                            if (!string.IsNullOrWhiteSpace(stitchedText))
                            {
                                transcriptionBuffer.Append(stitchedText);
                                transcriptionBuffer.Append(" ");
                                onSegmentTranscribed(stitchedText);
                            }
                            
                            previousTranscription = currentText;
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

            if (transcriptPath != null && transcriptionBuffer.Length > 0)
            {
                try
                {
                    await File.WriteAllTextAsync(transcriptPath, transcriptionBuffer.ToString().Trim());
                    AnsiConsole.MarkupLine($"[green]Full transcript saved to: {Markup.Escape(transcriptPath)}[/]");
                }
                catch (Exception ex)
                {
                    AnsiConsole.MarkupLine($"[red]Error saving transcript: {Markup.Escape(ex.Message)}[/]");
                }
            }
        }
    }

    /// <summary>
    /// Stitches transcription segments together by detecting and removing duplicate words
    /// that appear at the end of the previous segment and the start of the new segment.
    /// </summary>
    /// <param name="previousText">The previous transcription segment</param>
    /// <param name="newText">The new transcription segment</param>
    /// <returns>The deduplicated text to append (only new unique words)</returns>
    private string StitchTranscriptionSegments(string previousText, string newText)
    {
        if (string.IsNullOrWhiteSpace(previousText))
        {
            // First segment, return as-is
            return newText;
        }

        if (string.IsNullOrWhiteSpace(newText))
        {
            return string.Empty;
        }

        // Split into words
        var previousWords = previousText.Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
        var newWords = newText.Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

        if (previousWords.Length == 0)
        {
            return newText;
        }

        if (newWords.Length == 0)
        {
            return string.Empty;
        }

        // Look for overlapping words at the boundary
        // Start with 2-word minimum match as specified by user
        int maxOverlap = Math.Min(previousWords.Length, newWords.Length);
        int overlapLength = 0;

        // Try to find the longest overlap, starting from 2 words
        for (int overlap = Math.Min(maxOverlap, 10); overlap >= 2; overlap--)
        {
            bool match = true;
            for (int i = 0; i < overlap; i++)
            {
                string prevWord = previousWords[previousWords.Length - overlap + i];
                string newWord = newWords[i];
                
                // Case-insensitive comparison for better matching
                if (!prevWord.Equals(newWord, StringComparison.OrdinalIgnoreCase))
                {
                    match = false;
                    break;
                }
            }

            if (match)
            {
                overlapLength = overlap;
                break;
            }
        }

        if (overlapLength > 0)
        {
            // Found overlap, return only the non-overlapping part of new text
            var uniqueWords = newWords.Skip(overlapLength);
            return string.Join(" ", uniqueWords);
        }
        else
        {
            // No overlap found, return entire new text
            return newText;
        }
    }
}