[<- Back to Main README](../../README.md)

# Live Transcription Feature - Implementation Details

This document provides detailed explanations, rationale, and implementation considerations for the tasks outlined in the [Live Transcription Feature Plan](./README.md).

## 1. Modify `Program.cs` for Menu Integration

**Goal:** Integrate a "Live Transcription" option into the existing command-line interface.

**Details:**

-   [x] **Add Menu Option:** ✅ DONE
-   [x] **Handle Menu Choice:** ✅ DONE

## 2. Implement Core Live Transcription Logic

This logic will reside in `Workspace.cs`.

### Task 2.1: Develop a new method (e.g., `StartLiveTranscriptionAsync`)

-   **Purpose:** This public asynchronous method will be the main entry point for the live transcription feature.
-   **Signature:** `public async Task StartLiveTranscriptionAsync()`
-   **Responsibilities:** Orchestrate audio initialization, Whisper.net setup, the processing loop, and cleanup.
    -   [ ] Define the method structure in `Workspace.cs`.

### Task 2.2: Initialise Audio Input (NAudio)

-   **Goal:** Capture raw audio data from a microphone.
-   **Steps & Considerations:**
    -   **Device Selection:**
        -   [ ] Use NAudio to list available audio input devices (`WaveInEvent.DeviceCount`, `WaveInEvent.GetCapabilities(n)`).
        -   [ ] If multiple devices exist, prompt the user to select one (e.g., using `Spectre.Console.SelectionPrompt`).
        -   **_WSL Specifics:_** _When developing in WSL, verify that your microphone is correctly passed through and recognized by the Ubuntu environment. Test basic audio input in WSL (e.g., with `arecord`) if NAudio encounters issues finding devices. Ensure Windows microphone privacy settings allow access._
    -   **Audio Capture Setup:**
        -   [ ] Instantiate `WaveInEvent` (or a similar NAudio class like `WasapiCapture`).
        -   [ ] Set the desired `WaveFormat`. This is crucial for compatibility with Whisper.
            -   **Recommended Format:** 16kHz sample rate, 1 channel (mono), 16-bit PCM.
            -   Example: `waveIn.WaveFormat = new WaveFormat(16000, 16, 1);`
        -   [ ] Subscribe to the `DataAvailable` event.
        -   [ ] Start recording using `waveIn.StartRecording()`.

### Task 2.3: Initialise Whisper.net for Streaming

-   **Goal:** Prepare the Whisper.net components for processing audio data.
-   **Steps & Considerations:**
    -   **Model Loading:** The model loading logic (selecting `.bin` file, creating `WhisperFactory`) is already present in the `Workspace` constructor. This can be reused.
        -   [ ] Ensure the factory and model (`ModelPath`, `WhisperFactory` instance) are accessible to the `StartLiveTranscriptionAsync` method.
    -   **Processor Creation:**
        -   [ ] Create a `WhisperProcessor` instance from the factory within `StartLiveTranscriptionAsync`.
            -   Example: `await using var processor = whisperFactory.CreateBuilder().WithLanguage("en") /* or auto */ .Build();`

### Task 2.4: Implement Real-time Audio Processing Loop

-   **Goal:** Continuously capture, buffer, process audio, and display results.
-   **Event-Driven Approach (NAudio `DataAvailable`):**
    -   [ ] Implement the `DataAvailable` event handler.
    -   `e.Buffer` contains the raw audio bytes, and `e.BytesRecorded` indicates the amount of valid data.
-   **Audio Buffering:**
    -   Whisper processes audio in segments. Feeding very small, disjointed chunks from `DataAvailable` directly can lead to poor quality.
    -   [ ] **Strategy:** Implement logic to accumulate audio data from `DataAvailable` events into an intermediate buffer (e.g., a `List<byte>` or a `MemoryStream`).
    -   [ ] Determine and implement a strategy for when to pass the buffered audio for transcription (e.g., after a certain duration or byte count).
-   **Audio Format Conversion (if necessary):**
    -   [ ] Ensure the audio data passed to Whisper.net is in the expected format. Implement conversion if needed (NAudio provides utilities).
-   **Transcription:**
    -   [ ] Create a `Stream` from your buffered audio data (e.g., `new MemoryStream(bufferedAudioBytes)`).
    -   [ ] Use `await foreach (var segment in processor.ProcessAsync(audioStream))` to get transcribed segments.
-   **Display Results:**
    -   [ ] As each `segment` is received, display `segment.Text` to the console (e.g., using `AnsiConsole.MarkupLine()`).
    -   [ ] Provide continuous feedback to the user (e.g., "Listening...", "Transcribing segment...").
-   **Threading/Async Operations:**
    -   NAudio's `DataAvailable` event typically fires on a separate thread.
    -   [ ] Ensure UI updates (console output) are handled appropriately (though `AnsiConsole` is generally thread-safe).
    -   [ ] Ensure all Whisper.net processing (`ProcessAsync`) is `await`ed.

### Task 2.5: Implement Stop Mechanism

-   **Goal:** Allow the user to gracefully terminate live transcription.
-   **Steps & Considerations:**
    -   **User Input:**
        -   [ ] Implement logic to monitor for a key press (e.g., "Press ESC to stop") using `Console.KeyAvailable` and `Console.ReadKey(true)` in a non-blocking way.
        -   [ ] Implement a flag (e.g., `isStopRequested = true`) to signal termination.
    -   **Stopping Capture:**
        -   [ ] In the `DataAvailable` handler or the main processing loop, check the `isStopRequested` flag.
        -   [ ] Call `waveIn.StopRecording()` when termination is requested.
    -   **Resource Disposal:** This is critical to avoid issues.
        -   [ ] Dispose of `WaveInEvent` object: `waveIn.Dispose();`.
        -   [ ] Ensure `WhisperProcessor` and `WhisperFactory` (if instance is managed locally in method) are disposed of (e.g. `await using` or `finally` block).

### Task 2.6: Basic Error Handling

-   **Goal:** Make the application more robust to common issues.
-   **Steps & Considerations:**
    -   [ ] Wrap NAudio initialization and Whisper processing in `try-catch` blocks.
    -   [ ] Handle potential exceptions (no audio devices, capture errors, model loading failures, transcription errors).
    -   [ ] Provide informative error messages using `AnsiConsole.MarkupLine("[red]Error: ...[/]");`.

## 3. Refinement and Advanced Features (Future Iterations)

For potential future enhancements and advanced features, please see the [Live Transcription Feature - Roadmap & Future Enhancements](./Roadmap.md).

## Key Considerations (Reiterated from Previous Discussions)

-   **Audio Format Compatibility:** Strictly ensure NAudio captures in, or converts to, a format Whisper.net expects (typically 16kHz, 16-bit mono PCM).
-   **Resource Management:** Diligently use `using` statements or `try/finally` blocks to dispose of `IDisposable` objects from NAudio and Whisper.net to prevent memory leaks or device lockups.
-   **User Experience (UX):** Keep the user informed about what the application is doing (e.g., "Listening...", "Transcribing...", "Press ESC to stop").
-   **Whisper.net Streaming Behavior:** The exact internal behavior of `WhisperProcessor.ProcessAsync(Stream)` with continuously written-to streams might require experimentation to optimize chunking/buffering strategies.

This detailed document should guide the implementation process. Each task can be broken down further into smaller coding steps.
