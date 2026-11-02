# Whisper transcription workspace

**Goal:** Replace the default benchmark view with a desktop Whisper transcription workflow, persistent locations/state, and a `transcribe` terminal launcher.

**Architecture:** Pinia consumes typed local Nitro endpoints; server-only Bun SQLite persists settings, selection, and job metadata. Native Whisper and shared Nemotron diarisation retain existing worker/process-group safety; benchmark data and engines remain intact but outside the default UI. Originals are never passed to workers or modified.

## File boundaries
- `shared/workspace.ts`: settings, preference, job, and response contracts.
- `harness/workspace/`: SQLite persistence, validated locations, private working copies, job orchestration, transcript exports. Focused modules, each under roughly 250 lines.
- `server/api/workspace*`, `server/api/transcriptions/`, `server/api/source-files*`: thin API adapters.
- `app/stores/workspace.ts`: Pinia hydration/actions and selected-job detail; no transcript localStorage.
- `app/components/transcription/`: file input/drop, source list, history, status, transcript/copy controls.
- `app/pages/index.vue`, `app/pages/settings.vue`, `app/app.vue`: thin routing/shell composition.
- `bin/install`, `bin/transcribe`: idempotent zsh PATH setup and loopback local launch, adapted from Freebore.

## Tasks and checks
1. Persist validated source/working/output locations and preferences in `.local/workspace.sqlite`. Test restart persistence, invalid/symlink paths, overlap/source protections, and update rejection while active.
2. Process explicit source selections or streamed file uploads into exclusive private working copies. Test traversal, size limits, unsupported extensions, worker failure/cancellation, no overwrites, original integrity, and exclusive shared runner ownership. Capture per-job location snapshots; changing settings must not redirect existing jobs. Export readable plain and speaker-labelled text with exclusive creation.
3. Add Pinia-backed desktop screens: choose/drop audio, source-directory files, start/cancel, history selection, reveal/copy, settings save with validation feedback. Keep privacy reveal transient and errors visible. Preserve old benchmark implementation without importing it into the default page.
4. Adapt Freebore installer for `transcribe`; run installer and verify a fresh interactive zsh resolves the command. Preserve `.zshrc`; no commit or push.
5. Run synthetic unit tests, typecheck, lint, desktop Playwright tests, production build and isolated API verification. Use browser to exercise picker/drop, settings persistence, history/copy and error paths; inspect console/network. Use synthetic audio for verification; do not reprocess private counselling audio without need.

## HTTP contract
- `GET /api/workspace`: `WorkspaceSnapshot`.
- `PUT /api/workspace/settings`: JSON `LocationSettings`, returns saved settings.
- `PUT /api/workspace/preferences`: JSON `WorkspacePreferences`, returns saved preferences.
- `GET /api/source-files`: `{ files: SourceFile[] }`, only supported leaf audio files under configured source directory.
- `POST /api/transcriptions`: JSON `{ sourceName: string }`, returns `TranscriptionJob` and starts full Whisper inference.
- `POST /api/transcriptions/upload?name=...`: same-origin `application/octet-stream`, streamed bounded upload; returns started `TranscriptionJob`.
- `GET /api/transcriptions/:id`: `TranscriptionDetail`.
- `POST /api/transcriptions/:id/cancel`: JSON `{}`, returns success.
- `GET /api/transcriptions/:id/audio`: range-capable playback of that job's private WAV copy only.

**Constraints:** Desktop only. No .NET/CUDA setup. No deletion/migration of old benchmarks. Keep source and working/output locations separate; private artifacts gitignored. Never print counselling transcript contents in tool output.

## Sign-off inventory
- File picker and drag/drop: synthetic audio selected, explicit Transcribe action, failed-upload feedback, processing state/cancel.
- Source directory: saved setting, supported files listed, leaf-only selection; invalid paths and unsafe overlaps rejected.
- Transcript: synthetic completed job, transient reveal, audio playback/seek, plain/speaker copy and clipboard failure feedback.
- Persistence: saved settings/copy preference/selection survive page reload; jobs survive server restart; reveal does not persist.
- Desktop layout: primary controls visible at 1440 × 1000, no horizontal overflow, empty/history/review/settings states.
- Backend: bounded upload, source immutability, exclusive exports, per-job location snapshots, cancellation and orphan admission guards.
- Launcher: isolated installer idempotence test, fresh zsh command resolution, help from outside checkout, reuse current loopback service.
- Privacy: no real source/transcript access in automated fixtures, no transcript localStorage, no cross-origin JSON or binary upload.
