# Whisper large-v3-turbo + native Nemotron diarization experiment

Isolated Bun adapter; no .NET changes or global installs. Requires existing Bun,
CMake and Apple command-line compiler tools on Apple Silicon macOS. Only this
directory is written by setup. Never pass original recordings: supply a disposable
working-copy WAV. No private recordings were accessed for setup/testing.

## Build and run

```sh
cd /Users/james/src/WhisperSpeechToTextDotnet/apps/whisper-experiment
bash setup.sh
bun test
export NEMO_SPEECH_BIN="$PWD/../nemo-experiment/.runtime/nemo-speech-0.3.0-macos-aarch64-metal/bin/nemo-speech"
export NEMO_DIAR_MODEL="$PWD/../nemo-experiment/models/nvidia/Nemotron-3-Diarization/f667ed73aee57d40cc39428eb768b4fd87a0a29e/Nemotron-3-Diarization.q8_0.gguf"
bun worker.ts --input working.wav --output results/result.json
```

When a harness knows the original path, it may pass `--origin /path/to/original`.
Identity is checked by device/inode, so a disposable copy can live under any
user-selected folder while a hard link or direct pass-through is rejected.
`--progress status.json` writes atomic metadata-only ASR percentage/stage updates;
diarisation reports an indeterminate stage because the native tool has no percentage.

Set up the sibling NeMo experiment separately first. Both environment values must
point at existing **local files**. No diarizer fallback, dummy speakers, download
or automatic source discovery occurs at inference. Inference uses no network.
Absolute `worker.ts` paths work from another cwd. The output must not already
exist; choose unique filenames and respect nonzero exit status. The worker never
overwrites its input. With `--origin`, it also rejects the original file or a hard
link to it, regardless of which directory contains the working copy.

Whisper runs once over the supplied file, using its native internal windowing,
with language fixed to English. For interoperable CLI inputs supply mono PCM16,
16 kHz WAV; conversion is the harness's responsibility. No ffmpeg is required by
this adapter. Whole-file memory/quality on long counselling audio is **untested**.

## Exact native invocation and output policy

ASR command (temporary output prefix is private):

```sh
.runtime/whisper.cpp/build/bin/whisper-cli \
  -m models/ggml-large-v3-turbo.bin -f working.wav -l en -oj -of PRIVATE_PREFIX -np
```

Diarization uses the [official v0.3.0 standalone CLI](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/v0.3.0/docs/cli.md):

```sh
"$NEMO_SPEECH_BIN" diarize working.wav --model "$NEMO_DIAR_MODEL" \
  --backend metal --preset v3-streaming --format json --output PRIVATE_DIAR_JSON
```

The `v3-streaming` pass preserves diarizer state across the complete input; no
short-file full-attention `--offline` mode is used. NeMo JSON is
`{segments:[{start,end,speaker}]}`, seconds, 1-based integer speakers. Whisper JSON
is `{transcription:[{offsets:{from,to},text}]}`, milliseconds. Malformed shapes,
reversed/nonfinite/negative timestamps and invalid speakers are rejected.

Normalized result contains `segments`, `turns`, `stages`, `metadata`, `warnings`.
Whisper segments are **not words**. Each entire segment receives the speaker with
the greatest positive temporal overlap; first native turn wins ties. Native turns
(including overlaps) are retained independently, labels become `speaker_1` etc.,
and no overlap means no label. Text is never split at an invented word boundary.
This can conceal speaker changes inside a long segment: consult `turns` and do not
interpret alignment as joint model inference or validated speaker accuracy.

`transcriptionSeconds` and `diarisationSeconds` are sequential wall times including
process startup, model load and JSON parsing. Model provenance and backend policy
are included in metadata. Whisper is compiled with `GGML_METAL=ON` and uses its
default GPU path, but CPU fallback is possible and not detected/enforced; metadata
therefore says `whisper-metal-auto+nemo-metal`, not guaranteed all-GPU execution.

Native stdout/stderr are discarded, never copied to logs (either may contain
transcript text). Failures deliberately have generic diagnostics. Output is
exclusive-create mode 0600; jobs are created under ignored `.runtime/jobs` with
umask 077 and cleaned in `finally`. SIGINT/SIGTERM abort active native work; each
spawn has a six-hour limit and escalates SIGTERM to SIGKILL after five seconds.
Children are **not detached**, so the harness may also cancel the worker process
group. SIGKILL/crashes can leave ignored job files; securely remove them manually.
No claim is made about encryption, full-disk snapshots, or forensic erasure.

## Pinned provenance and licences

- [whisper.cpp v1.8.2](https://github.com/ggml-org/whisper.cpp/tree/4979e04f5dcaccb36057e059bbaed8a2f5288315),
  commit `4979e04f5dcaccb36057e059bbaed8a2f5288315`, MIT. Setup fetches the
  official GitHub source archive by immutable commit; licence is retained at
  `.runtime/whisper.cpp/LICENSE`. Build is Release, `GGML_METAL=ON`, target
  `whisper-cli`, four build jobs; see `setup.sh` for exact CMake commands. Source
  archives are fetched over HTTPS with a commit pin, not a separately verified
  archive digest. No global installation or .NET runtime is involved.
- [GGML large-v3-turbo](https://huggingface.co/ggerganov/whisper.cpp), repository
  revision `5359861c739e955e79d9a303bcbc70fb988958b1`, file
  `ggml-large-v3-turbo.bin`, **1,624,555,275 bytes**, SHA-256
  `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69`.
  Setup verifies the SHA before final placement and on subsequent setup runs.
  GGML conversion: ggerganov; original [OpenAI Whisper](https://github.com/openai/whisper)
  weights/code are MIT, and the GGML repository model card also declares MIT.
- Reused (not downloaded here) [NVIDIA NeMo-Speech.cpp v0.3.0](https://github.com/NVIDIA/NeMo-Speech.cpp/releases/tag/v0.3.0),
  Apache-2.0, and [Nemotron-3-Diarization](https://huggingface.co/nvidia/Nemotron-3-Diarization),
  [OpenMDW Licence Agreement 1.1](https://openmdw.ai/license/1-1/), revision
  `f667ed73aee57d40cc39428eb768b4fd87a0a29e`, Q8_0 GGUF SHA-256
  `08456d9e22cd9a323c0364d98375f3746d6e68507ebb705cd46438c534c7a3a1`.
  Review NVIDIA terms before processing real material. See sibling provenance
  for release archive checksums. Env overrides are reported as model paths, not
  falsely assumed to have the pinned model identity.

Local footprint after setup: approximately 44 MiB runtime/source + 1.51 GiB model;
downloaded artifacts total under 1.7 GB. No duplicate diarization weights.

## Public smoke only

The pinned whisper.cpp archive already includes public `samples/jfk.wav`. With
the environment above:

```sh
bun worker.ts --input .runtime/whisper.cpp/samples/jfk.wav --output results/jfk-smoke.json
```

Verified normalized output: 1 Whisper segment, 3 native diarization turns, private
file mode 0600. First run approximately 9.01 s ASR / 0.27 s diarization; this is a
short execution smoke, **not** an accuracy or long-audio benchmark. Tests use
synthetic parser/alignment fixtures and subprocess cancellation fixtures. No
transcript contents are logged. Models, runtime, jobs and results remain ignored.
