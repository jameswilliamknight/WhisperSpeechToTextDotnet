# Backend comparison protocol

The protocol lives here; the executable harness, UI and private results live in [transcription-studio](../transcription-studio/README.md).

## Goal

Choose a performant Apple Silicon backend with mandatory diarisation, without removing the existing Windows/NVIDIA or Whisper functionality. Named-speaker identification is out of scope.

## Candidates

| Candidate | Hardware | Role |
| --- | --- | --- |
| Existing Whisper.net app | Mac and NVIDIA PC, measured separately | Transcription baseline; no diarisation |
| FluidAudio + offline diarisation | Apple Silicon | Primary Mac candidate |
| NeMo-Speech.cpp + Nemotron 3 Diarization | Apple Silicon; NVIDIA separately | Native alternative |
| WhisperX + Community-1 | Windows/NVIDIA, initially WSL2 | GPU meeting-transcription candidate |

## Inputs

Use the same consented recordings for every candidate: solo NZ-accented dictation, a two-person conversation, a multi-person meeting, and noisy/overlapping speech. Include short replies, Māori names/phrases and one long recording. Preserve participant-specific channels in originals.

The Studio stores private copies, generated WAVs, logs and results under its ignored `.local/` directory. Keep originals outside the repository. Do not commit transcripts, reference annotations or voice recordings containing personal information.

## Measurements

1. Record the input checksum, duration, OS, hardware, runtime version, exact model/revision, precision, acceleration backend and invocation.
2. Separate first-run downloads/compilation and cold loading from warmed processing. Warm once, then measure three complete runs; report the median and range.
3. Report conversion, transcription, alignment, diarisation and total wall time where available. Measure peak memory and audio duration divided by processing time. Do not compare GPU upstream claims with local end-to-end timings.
4. Manually transcribe identical evaluation excerpts. Compare word error rate with documented normalisation and separately review names/Māori phrases.
5. Annotate speaker turns on those excerpts. Report diarisation error rate with the same overlap and boundary-tolerance policy for all candidates; also inspect speaker swaps, short replies and missed speech.
6. Keep original diarisation turns and timestamped words alongside a readable transcript. Do not treat overlap detection as recovery of both speakers' words.

## Acceptance and integration

- Compare the Mac candidates against Whisper on the same Mac. Report ASR-only and full diarised timings separately, since the baseline performs less work.
- Present measured speed/accuracy trade-offs before choosing a backend or setting an acceptable regression threshold.
- Reject candidates that cannot produce usable speaker labels, lose long-recording content, or have unresolved crashes.
- Only integrate a selected backend after review. Keep manual backend selection and the existing Whisper path available; platform detection should recommend a backend, not remove alternatives.
