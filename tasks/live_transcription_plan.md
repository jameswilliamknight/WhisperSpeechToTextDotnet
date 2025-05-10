[<- Back to Main README](../README.md)

# Live Transcription Feature Plan

This document outlines the high-level tasks required to implement the live transcription feature in the WhisperPrototype application.

## Task Breakdown

1.  **Modify `Program.cs` for Menu Integration**

    -   Add a "Live Transcription" option to the main menu.
    -   Handle the new menu choice to initiate the live transcription process.

2.  **Implement Core Live Transcription Logic (in `Workspace.cs`)**

    -   **Task 2.1:** Develop a new method (e.g., `StartLiveTranscriptionAsync`).
    -   **Task 2.2:** Initialise Audio Input (NAudio).
        -   Select audio input device.
        -   Configure and start audio capture.
    -   **Task 2.3:** Initialise Whisper.net for Streaming.
        -   Load and configure the Whisper model and processor.
    -   **Task 2.4:** Implement Real-time Audio Processing Loop.
        -   Capture audio data from NAudio.
        -   Buffer audio data into suitable chunks for Whisper.
        -   Process audio chunks with Whisper.net.
        -   Display transcribed segments in real-time.
    -   **Task 2.5:** Implement Stop Mechanism.
        -   Allow the user to gracefully stop the live transcription.
        -   Ensure proper disposal of resources (NAudio, Whisper.net).
    -   **Task 2.6:** Basic Error Handling.
        -   Implement error handling for audio device issues and transcription errors.

3.  **Refinement and Advanced Features (Future Iterations)**
    -   Explore advanced buffering (e.g., sliding window with overlap).
    -   Investigate Voice Activity Detection (VAD) for smarter chunking.
    -   Implement more robust text merging for overlapping transcriptions if used.
    -   Improve UI/UX for live feedback and controls.

## Associated Detailed Document

For detailed explanations, rationale, and implementation considerations for each task, please refer to [Live Transcription Implementation Details](./live_transcription_details.md).
