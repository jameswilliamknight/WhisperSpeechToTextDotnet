# WhisperX experiment

Status: scaffold only; no executable, dependencies or models installed.

## Scope

- Windows 11/NVIDIA batch transcription through WhisperX, initially evaluating WSL2/CUDA.
- Forced word alignment and pyannote Community-1 diarisation.
- Anonymous speaker labels; no voiceprint database.
- Preserve the existing Whisper.net/CUDA app and live-transcription workflow.

Keep the Python environment and dependency lockfile local to this directory. Confirm supported Python, PyTorch and CUDA versions for the selected release before installing. Obtain gated model access explicitly; do not commit Hugging Face tokens. Disable pyannote telemetry for privacy-first evaluation.

## Evaluation

Follow the [shared benchmark protocol](../benchmarks/README.md). Compare with the existing app on the same NVIDIA PC. Record installation/runtime compatibility and model licences alongside performance.

## Sources

- [WhisperX](https://github.com/m-bain/whisperX)
- [pyannote Community-1](https://huggingface.co/pyannote/speaker-diarization-community-1)
