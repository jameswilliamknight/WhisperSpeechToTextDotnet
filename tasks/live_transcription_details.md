[<- Back to Main README](../README.md)

# Live Transcription Feature - Implementation Details

This document provides detailed explanations, rationale, and implementation considerations for the tasks outlined in the [Live Transcription Feature Plan](./live_transcription_plan.md).

## 1. Modify `Program.cs` for Menu Integration

**Goal:** Integrate a "Live Transcription" option into the existing command-line interface.

**Details:**

-   **Add Menu Option:**

    -   In `Program.cs`, modify the `SelectionPrompt` in the main `while` loop.
    -   Add `"Live Transcription"` to the `AddChoices()` method.
    -   Example: `.AddChoices("Process MP3 files", "Live Transcription", "Exit")`

-   **Handle Menu Choice:**
    -   Add a new `case "Live Transcription":` to the `switch` statement that handles the user's choice.
    -   Inside this case, call the new method responsible for initiating live transcription (e.g., `await workspace.StartLiveTranscriptionAsync(); break;`).
    -   **Note:** The existing `MenuEngine.SelectFromOptionsAndDelegateProcessingAsync()` is designed for file selection and processing. For live transcription, which is a direct action, this engine component will likely not be used.

## 2. Implement Core Live Transcription Logic

This logic will reside in `Workspace.cs`.

### Task 2.1: Develop a new method (e.g., `StartLiveTranscriptionAsync`)

-   **Purpose:** This public asynchronous method will be the main entry point for the live transcription feature.
-   **Signature:** `public async Task StartLiveTranscriptionAsync()`
-   **Responsibilities:** Orchestrate audio initialization, Whisper.net setup, the processing loop, and cleanup.

### Task 2.2: Initialise Audio Input (NAudio)

-   **Goal:** Capture raw audio data from a microphone.
-   **Steps & Considerations:**
    -   **Device Selection:**
        -   Use NAudio to list available audio input devices (`WaveInEvent.DeviceCount`, `WaveInEvent.GetCapabilities(n)`).
        -   If multiple devices exist, prompt the user to select one (e.g., using `Spectre.Console.SelectionPrompt`).
    -   **Audio Capture Setup:**
        -   Instantiate `WaveInEvent` (or a similar NAudio class like `WasapiCapture` for more modern API access if preferred, though `WaveInEvent` is common).
        -   Set the desired `WaveFormat`. This is crucial for compatibility with Whisper.
            -   **Recommended Format:** 16kHz sample rate, 1 channel (mono), 16-bit PCM.
            -   Example: `waveIn.WaveFormat = new WaveFormat(16000, 16, 1);`
        -   Subscribe to the `DataAvailable` event. This event will fire when NAudio has a buffer of audio data.
        -   Start recording using `waveIn.StartRecording()`.

### Task 2.3: Initialise Whisper.net for Streaming

-   **Goal:** Prepare the Whisper.net components for processing audio data.
-   **Steps & Considerations:**
    -   **Model Loading:** The model loading logic (selecting `.bin` file, creating `WhisperFactory`) is already present in the `Workspace` constructor. This can be reused. Ensure the factory and model are accessible to the live transcription method.
    -   **Processor Creation:** Create a `WhisperProcessor` instance from the factory.
        -   Example: `await using var processor = whisperFactory.CreateBuilder().WithLanguage("en") /* or auto */ .Build();`
        -   Consider making language selection configurable or defaulting to "auto" or "en".

### Task 2.4: Implement Real-time Audio Processing Loop

-   **Goal:** Continuously capture, buffer, process audio, and display results.
-   **Event-Driven Approach (NAudio `DataAvailable`):**
    -   The `DataAvailable` event handler will be the starting point of each processing cycle.
    -   `e.Buffer` contains the raw audio bytes, and `e.BytesRecorded` indicates the amount of valid data.
-   **Audio Buffering:**
    -   Whisper processes audio in segments. Feeding very small, disjointed chunks from `DataAvailable` directly can lead to poor quality.
    -   **Strategy:** Accumulate audio data from `DataAvailable` events into an intermediate buffer (e.g., a `List<byte>` or a `MemoryStream` that you continuously write to).
    -   Once a sufficient amount of audio is buffered (e.g., 1-5 seconds; this is tunable), pass this buffered audio for transcription.
-   **Audio Format Conversion (if necessary):**
    -   Ensure the audio data passed to Whisper.net is in the expected format (typically 16kHz, mono, float samples for `ProcessAsync(Stream)` if it's a WAV stream, or ensure the raw bytes match processor expectations). NAudio provides utilities for format conversion if the capture format differs from Whisper's required input.
-   **Transcription:**
    -   Create a `Stream` from your buffered audio data (e.g., `new MemoryStream(bufferedAudioBytes)`).
    -   Use `await foreach (var segment in processor.ProcessAsync(audioStream))` to get transcribed segments.
-   **Display Results:**
    -   As each `segment` is received, display `segment.Text` to the console (e.g., using `AnsiConsole.MarkupLine()`).
    -   Provide continuous feedback to the user (e.g., "Listening...", "Transcribing segment...").
-   **Threading/Async Operations:**
    -   NAudio's `DataAvailable` event typically fires on a separate thread. UI updates (console output) should be handled appropriately, though `AnsiConsole` is generally thread-safe.
    -   All Whisper.net processing (`ProcessAsync`) should be `await`ed to prevent blocking and keep the application responsive.

### Task 2.5: Implement Stop Mechanism

-   **Goal:** Allow the user to gracefully terminate live transcription.
-   **Steps & Considerations:**
    -   **User Input:**
        -   Monitor for a key press (e.g., "Press ESC to stop") using `Console.KeyAvailable` and `Console.ReadKey(true)` in a non-blocking way within your main loop or a separate task.
        -   Set a flag (e.g., `isStopRequested = true`) when the stop key is pressed.
    -   **Stopping Capture:**
        -   In the `DataAvailable` handler or the main processing loop, check the `isStopRequested` flag.
        -   Call `waveIn.StopRecording()`.
    -   **Resource Disposal:** This is critical to avoid issues.
        -   Dispose of `WaveInEvent` object: `waveIn.Dispose();`
        -   Dispose of `WhisperProcessor` and `WhisperFactory` if they were created specifically for this session (often done with `await using` or `using` blocks for automatic disposal).
        -   This should ideally be in `finally` blocks to ensure cleanup even if errors occur.

### Task 2.6: Basic Error Handling

-   **Goal:** Make the application more robust to common issues.
-   **Steps & Considerations:**
    -   Wrap NAudio initialization and Whisper processing in `try-catch` blocks.
    -   Handle potential exceptions such as:
        -   No audio input devices found.
        -   Errors during audio capture.
        -   Whisper model loading failures.
        -   Transcription errors.
    -   Provide informative error messages to the user using `AnsiConsole.MarkupLine("[red]Error: ...[/]");`.

## 3. Refinement and Advanced Features (Future Iterations)

These are items for consideration once the basic live transcription is functional. Details for these were discussed in subsequent interactions and are based on common strategies for improving live ASR systems.

-   **Advanced Audio Buffering (e.g., Sliding Window with Overlap):**
    -   **Why:** To improve accuracy at the boundaries of processed audio chunks by providing context from the preceding chunk.
    -   **How:** Process overlapping segments of audio. For example, process 0-5s, then 4-9s, then 8-13s, etc. The challenge lies in merging the overlapping transcribed text segments intelligently.
-   **Voice Activity Detection (VAD):**
    -   **Why:** To segment audio more intelligently based on speech presence, rather than fixed-size chunks. This can prevent cutting words and reduce processing during silences.
    -   **How:** Integrate a VAD library (or implement simple energy-based VAD) to detect speech start/end points. Feed these speech segments to Whisper.
-   **Robust Text Merging for Overlapping Transcriptions:**
    -   **Why:** If using a sliding window, a naive concatenation of transcribed text will result in duplicated words/phrases.
    -   **How:** Implement logic to find common suffixes/prefixes in the transcribed text from overlapping audio segments and merge them seamlessly. Sequence alignment algorithms can be used for more complex scenarios.
-   **Improve UI/UX:**
    -   Clearer status indicators (listening, processing, paused, error).
    -   Potentially show interim "unconfirmed" results that get refined as more audio comes in (a more advanced technique).
    -   Option to save the full live transcript.

## Key Considerations (Reiterated from Previous Discussions)

-   **Audio Format Compatibility:** Strictly ensure NAudio captures in, or converts to, a format Whisper.net expects (typically 16kHz, 16-bit mono PCM).
-   **Resource Management:** Diligently use `using` statements or `try/finally` blocks to dispose of `IDisposable` objects from NAudio and Whisper.net to prevent memory leaks or device lockups.
-   **User Experience (UX):** Keep the user informed about what the application is doing (e.g., "Listening...", "Transcribing...", "Press ESC to stop").
-   **Whisper.net Streaming Behavior:** The exact internal behavior of `WhisperProcessor.ProcessAsync(Stream)` with continuously written-to streams might require experimentation to optimize chunking/buffering strategies.

This detailed document should guide the implementation process. Each task can be broken down further into smaller coding steps.
