[<- Back to Main README](../../README.md)

# Live Transcription Feature

This section provides documentation for the live transcription feature implemented in the WhisperPrototype application. This feature allows for real-time audio capture from a microphone, processing via Whisper.net, and continuous display of the transcribed text.

## Feature Documentation

To understand the live transcription feature in detail, please refer to the following documents:

-   **[Implementation Overview](./Details.md):**
    Describes the core architecture, how the feature works, key components like `Workspace.cs` and the `IAudioCaptureService` pattern (including `WslPulseAudioCaptureService.cs`), and the data flow from audio capture to transcribed text.

-   **[Future Enhancements & Roadmap](./Roadmap.md):**
    Outlines potential future improvements and advanced capabilities planned for this feature.

-   **[Troubleshooting WSL Audio](./Troubleshooting.md):**
    Provides guidance for diagnosing and resolving common issues related to microphone input when using this feature within a Windows Subsystem for Linux (WSL) environment, particularly with PulseAudio.

## Original Plan (Historical)

The initial high-level plan for implementing this feature involved several key stages:

1.  **Menu Integration in `Program.cs`:**
    -   A "Live Transcription" option was added to the main menu.
    -   Logic was implemented to handle this choice and initiate the live transcription process.
2.  **Core Live Transcription Logic in `Workspace.cs`:**
    -   The `StartLiveTranscriptionAsync` method was developed.
    -   Audio input was initialized using platform-specific services (NAudio for Windows, `parec` via `WslPulseAudioCaptureService` for WSL, and `arecord` via `BareMetalAlsaAudioCaptureService` for Linux).
    -   Whisper.net was initialized for streaming.
    -   A real-time audio processing loop was implemented to handle audio capture, buffering, processing with Whisper.net, and displaying transcribed segments.
    -   A mechanism for the user to stop transcription (ESC key) was added.
    -   Basic error handling was included.
3.  **Refinements and Advanced Features:**
    -   Further refinements and advanced features were planned and are now tracked in the [Roadmap](./Roadmap.md).

_For the current detailed workings and architecture, please see the [Implementation Overview](./Details.md)._
