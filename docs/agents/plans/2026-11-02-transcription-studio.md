# Transcription Studio implementation plan

## Boundaries

- `apps/transcription-studio/shared/`: typed backend, run and transcript contracts.
- `apps/transcription-studio/harness/source/`: original read-only hashing, exclusive local copy, integrity checks and WAV preparation.
- `apps/transcription-studio/harness/backends/`: allow-listed native process adapters; no .NET dependencies.
- `apps/transcription-studio/harness/runs/`: serial execution, cancellation, durable private run records and timing.
- `apps/transcription-studio/server/`: loopback-only API with same-origin mutation checks; no client-supplied paths or commands.
- `apps/transcription-studio/app/`: Nuxt feature components and a polling composable. Source status, backend selection, run comparison and transcript/timeline are separate components; props down, actions up.
- `apps/fluidaudio-experiment/`: pinned Swift helper for ASR plus offline diarisation.
- `apps/nemo-experiment/`: pinned native Metal runtime and normalisation worker.

## Sequence

1. Protect `.local/` before copying anything. Hash the source before/after copying; never give its path to third-party engines. Test integrity checks and overwrite/symlink protections using synthetic fixtures, never the original.
2. Implement adapter contracts, bounded process execution, serial runs and durable results. Unit tests cover schema validation, backend availability, cancellation and recovery of interrupted jobs.
3. Build the local Nuxt UI using `freebore-ui`, small feature components and typed server routes. Verify typecheck, tests, build, then use Playwright to click real paths and inspect console/network errors.
4. Build Apple-native workers, smoke-test a short excerpt, then benchmark successful candidates on the complete working copy. Downloads and initial setup are not measured as warmed inference. Record runtime/model provenance, end-to-end time and raw diarisation turns. No accuracy score without reference annotation.
5. Verify source integrity and ignored paths, report actual measured results and blockers. Preserve the original .NET app and leave CUDA/Windows integration to a later session. No commit or push unless requested.
