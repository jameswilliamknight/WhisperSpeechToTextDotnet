# FluidAudio experiment

Real Apple Silicon Swift worker: complete-file Parakeet Ultra ASR plus offline
Community-1 diarisation (powerset segmentation, WeSpeaker embeddings, VBx).
No .NET dependency, CUDA, cloud audio, speaker enrolment, or live UI changes.

## Build and setup

Requires Apple Silicon, macOS 15+, Swift 6.2+ (verified with Swift 6.4 / macOS 27 / M5).
From this directory:

```sh
swift build -c release --product worker
BIN="$(swift build -c release --show-bin-path)/worker"
"$BIN" --version
"$BIN" --prepare-models
swift run -c release alignment-tests
```

The executable is **`worker`**, not `FluidAudioWorker`. On the verified CLT
toolchain its path is `.build/out/Products/Release/worker`; use `--show-bin-path`
rather than assuming `.build/release`. Dependency revision is immutable in
`Package.swift` and `Package.resolved`:
`e396cf780c4abf8e395087467c0585d3b0d17f68` (FluidAudio upstream main snapshot).
Only the `Diarizer` trait is enabled; TTS and NeMo text-processing are not linked.
SwiftPM still downloads upstream's declared NeMo binary artifact during resolve.

Setup downloads and loads models, but performs no recording inference. Do this
**before benchmarking**. Ultra is approximately 630 MB, Community-1 adds roughly
7 MB; verified local `.cache` ~637 MB and `.build` ~1 GB (~1.7 GB combined).
Models and worker temporary files stay under this experiment's `.cache` directory.
The cache root is embedded from the source location at build time; rebuild after
moving the checkout. Do not copy this executable expecting a relocatable cache.

## Run

```sh
"$BIN" --input /absolute/working-copy.wav --output /absolute/result.json --offline
```

Input must be an absolute WAV working-copy path; input is only opened for reading.
Output must not already exist (including an input hard link); the parent directory
must exist. Identical input/output and paths in the original-recording tree are
rejected. Never point this worker at originals. Stdout is empty, including SDK
download prints; progress and upstream performance diagnostics go to stderr.
Transcript/audio content is written only to the result file, not intentionally logged.
SDK log level is restricted to warnings to suppress transcript-bearing debug logs.

`--offline` forbids model network fetches via FluidAudio's `ModelHub.offlineMode`.
First install models without this flag. For v3 comparison/fallback, explicitly run
`--prepare-models --asr v3` and then add `--asr v3` to inference. There is no silent
model fallback: a failure exits nonzero. Ultra succeeded in the public smoke test.
Model assets follow the model revisions chosen by pinned FluidAudio; the Swift
lockfile pins the SDK, not every remote weight. Preserve the prepared model cache
for consistent benchmark comparisons.

## Output and interpretation

```json
{
  "segments": [{"start": 0.16, "end": 0.4, "text": "word", "speaker": "speaker_0"}],
  "turns": [{"start": 0.1, "end": 2.0, "speaker": "speaker_0"}],
  "stages": {"transcriptionSeconds": 0.0, "diarisationSeconds": 0.0},
  "metadata": {"runtime": "...", "models": ["..."], "backend": "..."},
  "warnings": []
}
```

All offsets and durations are seconds. Segments are words aggregated from the
SDK's SentencePiece token timings, not fabricated fixed-length chunks. A word is
assigned the speaker with greatest positive overlap (union of intervals per
speaker; lexical-ID tie break). No overlap means omitted `speaker`. Every raw SDK
diarisation turn is retained, including overlapping turns. This is **not source
separation or cross-talk recovery**: single-stream ASR may miss simultaneous speech.
If token timings are absent, whole-file text is retained with a warning and no
invented speaker. Speaker IDs are anonymous and file-local.

Both stages process the full WAV through SDK file APIs, with disk-backed conversion
for long inputs. Stages run sequentially and release ASR models before diarisation.
Stage wall times include model loading/conversion/inference (and downloads if setup
was skipped); use the [shared protocol](../benchmarks/README.md) to measure total
process wall time separately. JSON serialization/alignment are outside stage timers.

## Verification performed

- Release executable built successfully; benign CLT linker search-path warnings.
- Seven dependency-free Swift normalization/alignment checks passed. `swift test`
  cannot run on this CLT install: XCTest is unavailable and TestingMacros is missing,
  so `swift run -c release alignment-tests` is the supported test command.
- Ultra and Community-1 downloaded/loaded with `--prepare-models` successfully.
- Public [whisper.cpp JFK WAV](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav)
  smoke test succeeded: 22 word segments, 4 raw turns, all words assigned; valid
  nonnegative second offsets, first word 0.16 s and last word 10.88 s; stdout 0 bytes.
- Repeated the public smoke test with `--offline`: same counts, stdout 0 bytes;
  stages ~0.40 s ASR / 3.33 s diarisation (not a controlled performance benchmark).
- Identical input/output rejected with exit 1 and unchanged public WAV SHA-256.
- No private recording opened; long-recording accuracy/performance still needs the
  main experiment's working-copy benchmark. A successful short smoke test is not
  evidence of diarisation quality on a multi-speaker meeting.

## Official sources

- [FluidAudio source at pinned revision](https://github.com/FluidInference/FluidAudio/tree/e396cf780c4abf8e395087467c0585d3b0d17f68)
- [Diarisation guide](https://github.com/FluidInference/FluidAudio/blob/e396cf780c4abf8e395087467c0585d3b0d17f68/Documentation/Diarization/GettingStarted.md)
- [Parakeet Ultra](https://github.com/FluidInference/FluidAudio/blob/e396cf780c4abf8e395087467c0585d3b0d17f68/Documentation/ASR/ParakeetUltra.md)

Exact APIs were checked in the pinned `.build/checkouts/FluidAudio` source before
implementation, rather than assuming the upstream CLI diarises and transcribes.
