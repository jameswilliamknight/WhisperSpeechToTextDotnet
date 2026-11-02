# Native NeMo-Speech.cpp / Apple Silicon experiment

Isolated executable experiment, not a .NET app integration. Requires macOS arm64,
Bun and ffmpeg on PATH; no Python, CUDA, .NET, Ninja or global installer needed.
All downloaded runtime/models and temporary jobs stay here and are ignored.

## Setup and run

```sh
cd /Users/james/src/WhisperSpeechToTextDotnet/apps/nemo-experiment
bash setup.sh
bun test normalize.test.ts
bun worker.ts --input /absolute/path/to/working-copy.wav --output /absolute/path/to/result.json
```

The harness can invoke `bun` with the absolute path to `worker.ts`, from any cwd.
Inputs must be supplied working copies; this worker never locates source recordings.
Input WAV can be mono/stereo PCM16 or float32, 8–96 kHz (native diarizer limit).
Use different input/output paths. Nonzero exit means failure; do not consume old
output from an earlier run. No model download happens during worker inference.

## Pinning, provenance and licenses

- Official [NVIDIA release v0.3.0](https://github.com/NVIDIA/NeMo-Speech.cpp/releases/tag/v0.3.0),
  `nemo-speech-0.3.0-macos-aarch64-metal.tar.gz`, SHA-256
  `2b972ed8b5dba07492212acf8cb75cbf34ecb141198ffa1997febe84b7c4d9ed`.
  Setup verifies this literal digest before extracting. Runtime is Apache-2.0;
  bundled licenses/notices are in `.runtime/nemo-speech-0.3.0-macos-aarch64-metal/share/licenses`.
- Parakeet TDT 0.6B v3 Q8_0: `nvidia/parakeet-tdt-0.6b-v3`, revision
  `541d1f99c6b0c3cd0b11a95167540bb8edefd82b`, CC-BY-4.0 (NVIDIA).
- **Nemotron 3 Diarization** Q8_0: `nvidia/Nemotron-3-Diarization`, revision
  `f667ed73aee57d40cc39428eb768b4fd87a0a29e`, [OpenMDW Licence Agreement 1.1](https://openmdw.ai/license/1-1/).
  Review the [model card and terms](https://huggingface.co/nvidia/Nemotron-3-Diarization).
- Exact GGUF filenames and SHA-256 values are in `provenance.ts`, copied from the
  [tagged model index](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.3.0/models/index.json).
  Native `pull` checks pinned size and SHA-256. Combined weights: 820,987,584 bytes
  (~783 MiB), comfortably under 2 GB. Model attribution: NVIDIA, model links above.

Runtime `doctor` detected Apple M5 and compiled Metal; ASR smoke logs confirmed
`backend=MTL0`. Both stage invocations force `--backend metal` and explicit GGUF
paths: no accidental older Sortformer selection. Although the tagged CLI guide
still describes Sortformer as default, v0.3.0's actual model index/help default
is Nemotron 3; this worker never relies on either default.

## Output and long-audio policy

`segments` are timestamped **words** in seconds; `turns` are native diarization
segments with anonymous `speaker_1` etc., not identified people. Original
overlapping turns remain intact. Words get the greatest positive temporal-overlap
speaker (first native turn wins ties); unaligned words remain unlabelled. This is
an explicit adapter alignment policy, not native joint ASR/diarization output.
Invalid JSON/timestamps or nonempty text without word timings fail loudly.

Parakeet is offline-only and rejects `--stream`. The worker converts to 16 kHz
mono PCM and runs independent **60-second chunks**, rebasing native word times.
It reloads ASR each chunk; chunk-edge words can be lost or duplicated, with no
overlap reconciliation. Nemotron 3 runs once on the entire WAV with the native
stateful `v3-streaming` preset, never full-attention `--offline` (limited to ~6.6
minutes). Speaker state therefore spans ASR chunks. No claim of long-file quality
or speaker accuracy is made from the short smoke test.

Stages run sequentially. `transcriptionSeconds` includes ffmpeg conversion and
all ASR startup/model loads; `diarisationSeconds` includes diarizer startup/load.
Harness total wall time and memory should include the whole worker process tree.
Jobs are cleaned in `finally`; abrupt termination may leave ignored job files.
No network activity or dependency installation is required after setup.

## Public smoke test (no private recording)

```sh
curl -fL https://raw.githubusercontent.com/NVIDIA/NeMo-Speech.cpp/v0.3.0/test_files/asr/wav/test/jfk.wav -o .runtime/jfk.wav
bun worker.ts --input .runtime/jfk.wav --output .runtime/jfk-result.json
```

The upstream 11-second JFK inaugural-address sample (US federal public speech;
distributed by upstream under its repository notices) produced “And so, my fellow
Americans, ask not what your country can do for you, ask what you can do for your
country.” Native diarization found three turns, all speaker 1. This only proves
the native paths execute, not multi-speaker accuracy. Parser tests use synthetic
fixtures only and do not stand in for inference.

Verified locally: `bash setup.sh` succeeded; Bun 1.4.2 ran 5 parser tests (12
assertions, zero failures). Full worker smoke produced 22 word segments and three
turns; stage walls were 0.739s ASR and 0.308s diarization (warm filesystem cache,
not a comparative benchmark). Synthetic 121s silence, tested for segmentation
only without inference, split into exactly 60s/60s/1s. JFK WAV SHA-256:
`59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`.

Sources: [tagged CLI docs](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.3.0/docs/cli.md),
[native JSON renderer](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.3.0/app/transcribe.cpp),
[diarizer](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.3.0/app/diarize.cpp).
