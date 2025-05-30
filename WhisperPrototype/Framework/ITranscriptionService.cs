using Whisper.net;
using WhisperPrototype.Hardware;
using WhisperPrototype.Providers;

namespace WhisperPrototype.Framework;

public interface ITranscriptionService
{
    Task TranscribeFileAsync(
        FileInfo audioFileInfo,
        WhisperProcessor processor,
        string modelName,
        string outputDirectory,
        IAudioConverter audioConverter,
        string tempDirectoryPath);

    Task TranscribeAllFilesAsync(
        IEnumerable<FileInfo> audioFiles,
        WhisperProcessor processor,
        string modelName,
        string outputDirectory,
        IAudioConverter audioConverter,
        string tempDirectoryPath);

    Task StartLiveTranscriptionAsync(
        string modelPath,
        FeatureToggles featureToggles,
        IAudioCaptureService audioCaptureService,
        Func<AudioInputDevice, Task<AudioInputDevice>> selectInputDeviceAsync,
        Action<string> onSegmentTranscribed,
        string? outputDirectory,
        string modelName,
        CancellationToken cancellationToken
        );

    // We'll add live transcription methods later
} 