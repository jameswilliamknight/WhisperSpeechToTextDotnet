[< Main README](../../README.md)  ⚡  [Implementation Details](./Details.md)

# Live Transcription Feature - Roadmap & Future Enhancements

This document outlines potential future refinements and advanced features for the live transcription capability, to be considered after the core functionality is implemented and stable.

## Potential Future Enhancements

These are items for consideration once the basic live transcription is functional. Details for these were discussed in subsequent interactions and are based on common strategies for improving live ASR systems.

-   [ ] **Advanced Audio Buffering (e.g., Sliding Window with Overlap):**
    -   **Why:** To improve accuracy at the boundaries of processed audio chunks by providing context from the preceding chunk.
    -   **How:** Process overlapping segments of audio. For example, process 0-5s, then 4-9s, then 8-13s, etc. The challenge lies in merging the overlapping transcribed text segments intelligently.
-   [ ] **Voice Activity Detection (VAD):**
    -   **Why:** To segment audio more intelligently based on speech presence, rather than fixed-size chunks. This can prevent cutting words and reduce processing during silences.
    -   **How:** Integrate a VAD library (or implement simple energy-based VAD) to detect speech start/end points. Feed these speech segments to Whisper.
-   [ ] **Robust Text Merging for Overlapping Transcriptions:**
    -   **Why:** If using a sliding window, a naive concatenation of transcribed text will result in duplicated words/phrases.
    -   **How:** Implement logic to find common suffixes/prefixes in the transcribed text from overlapping audio segments and merge them seamlessly. Sequence alignment algorithms can be used for more complex scenarios.
-   [ ] **Improve UI/UX:**
    -   [ ] Clearer status indicators (listening, processing, paused, error).
    -   [ ] Potentially show interim "unconfirmed" results that get refined as more audio comes in (a more advanced technique).
    -   [ ] Option to save the full live transcript.
    -   [ ] **Configurable Language Selection:** Allow users to choose the transcription language (e.g., "en", "auto") for live transcription, possibly via a startup prompt or a setting in `appsettings.json`.
