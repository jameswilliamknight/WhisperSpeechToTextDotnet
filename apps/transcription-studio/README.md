# Transcription Studio

Local desktop transcription app using Whisper large-v3-turbo and Nemotron speaker diarisation. Nuxt/Vue + Pinia handle the UI; Bun SQLite retains settings, history and workspace preferences. Native workers remain isolated in sibling experiment directories. The original .NET app is not required or modified.

## Terminal command

From the repository root:

```sh
bash bin/install
# Open a new terminal, then:
transcribe
```

The installer follows Freebore's checkout-owned PATH pattern. It installs dependencies and appends the repository's `bin/` directory to `~/.zshrc` once, backing up an existing file before changing it. It does not download native models. `transcribe` works from any directory, opens http://localhost:42076 and reuses an existing instance. Use `transcribe --headless` to skip opening the browser; Ctrl-C stops a server started by that invocation.

## Daily transcription

- Drop an audio file onto the Transcribe page or use **Choose audio file**. Select **Transcribe** to upload a private working copy and run the full Whisper pipeline, including speaker diarisation. The new job is selected in History immediately.
- Alternatively configure a source directory in **Settings**, then select a recording from that directory. Source browsing is read-only; originals are never converted in place or passed to a native worker.
- While processing, the progress panel shows elapsed time, audio duration, the current stage, and Whisper's real ASR percentage. Diarisation has no native percentage, so that stage deliberately uses an indeterminate bar rather than a fabricated estimate.
- The transcript panel fills the remaining desktop viewport height and scrolls internally, with a usable minimum height. The outer page gains its own scrollbar only when the window is too short to fit the workspace.
- **Settings** also controls the working directory for intermediate files and the output directory for text exports. Use separate absolute paths. Source may be blank if you only use drop/file-picker uploads.
- Each job retains its own locations. Changing settings does not relocate or remove earlier jobs, and is blocked while a job is active.
- Reopen a completed transcription from **Recent transcriptions**, reveal its content, and copy plain text or speaker-labelled text. The list stays compact and scrolls independently. Completed jobs also produce `.txt` and `.speakers.txt` exports without overwriting previous files.
- Settings, history metadata, selected transcription and copy preference are stored server-side in ignored `.local/workspace.sqlite`. Transcript reveal, playback and selected browser files are transient; confidential text is not stored in browser localStorage.
- The initial source directory is unset. Working files and text exports default to ignored `.local/work/` and `.local/transcripts/`. Custom external directories remain your responsibility for backups and access control.

The earlier experiments and measurements remain intact at `/benchmarks`, but backend choices and benchmark controls are not part of the daily transcription page. Whisper still requires the shared Nemotron diarisation model; other transcription engines are not used by the new workflow.

## Start

```sh
cd apps/transcription-studio
bun install
bun run configure
bun run dev
```

Open http://localhost:42076. The service binds loopback only; API mutations require same-origin JSON, except the same-origin, bounded binary audio-upload endpoint. `freebore-ui` is loaded from the sibling checkout when present, otherwise from its GitHub Nuxt layer.

`configure` registers already installed experiment workers without downloading models. See [FluidAudio](../fluidaudio-experiment/README.md), [NeMo](../nemo-experiment/README.md) and [Whisper](../whisper-experiment/README.md) for native setup and licence/provenance details. FluidAudio's generated binary path may vary with the Swift toolchain; adjust the ignored adapter configuration using `swift build -c release --show-bin-path` if necessary.

## Source safety and private state

By default all local configuration, audio, transcripts, worker logs and results live under ignored `.local/`. Daily-transcription working files/exports can instead use the external directories chosen in Settings; the app database stays in `.local/`. The following source setup is only for the legacy benchmark harness. On this machine that approved source is already configured and copied. For another benchmark checkout, create `.local/config.json` privately:

```json
{ "sourcePath": "/absolute/path/to/original-recording.mp3" }
```

Use directory mode 0700 and configuration file mode 0600. Do not put private audio in `public/`, app assets or tracked fixtures.

```sh
bun run bench prepare
bun run bench verify
```

The original is only read for fingerprinting/copying; its permissions are never changed. Its SHA-256, size, modification time, permissions, inode and device are recorded and checked before/after runs. Workers receive a separate read-only WAV converted from the private MP3 copy. Symlinked sources/state directories and existing orphan-copy overwrites are refused. Source changes block further runs. Filesystem access time may change as an OS side effect of reading.

Nothing uploads audio or transcripts. Model downloads happen during explicit native setup; FluidAudio runs offline afterwards. This is local access control, not encryption or a sandbox against malicious native code. Treat third-party engines as trusted local dependencies. Keep the private source backup outside the repository.

## Benchmarks and review

At `/benchmarks`, select a backend and either a 90-second smoke excerpt or the complete recording. SQLite ownership permits one native job at a time across daily transcription, benchmarks and CLI. Jobs can be cancelled from the UI or, for benchmark CLI runs, Ctrl-C; abandoned records are marked interrupted on restart.

Ownership is serialised in private `runner.sqlite` transactions. A persisted process-group fence prevents new inference while an orphaned native worker may still be alive. Cancellation waits for descendants, not just the launcher. An unconfirmed/stuck fence deliberately blocks new work pending local review; do not simply delete it while a worker could be running.

```sh
bun run bench run fluidaudio smoke
bun run bench run fluidaudio full
bun run bench run nemo full
bun run bench run whisper full
bun run bench status
```

`status` prints metrics and counts, never transcript contents. Results persist across restarts in `.local/runs/<run-id>/`.

- Processing time includes native worker startup, model loading, ASR, diarisation, alignment and output. Input preparation is timed separately; setup/model downloads are not part of prepared offline runs.
- RTFx is audio duration divided by processing time. Full-run medians only combine matching source bytes, durations and runtime/model/backend metadata.
- macOS `/usr/bin/time -l` supplies maximum process RSS; this is not summed process/GPU/ANE memory. Stages and runtime/model provenance are recorded in each result.
- These are exploratory measurements on a working Mac, not an isolated hardware benchmark or proof of recognition accuracy. No WER/DER without manually annotated references.
- Raw speaker turns and word/segment timings are retained. The UI groups turns onto one lane per speaker and consecutive same-speaker words into passages, splitting at pauses over 1.5 seconds. Grouping does not alter benchmark data.
- Transcript text and audio are shown as soon as a job or run is selected; there is no reveal gate. Native inference may still produce confidential diagnostics in private log files.
- Speaker renames are display-only annotations stored with the job or run; raw worker speaker ids and benchmark result data are not modified.

NeMo uses independent 60-second ASR chunks and reloads the model for each chunk; boundaries are not reconciled. Whisper assigns speakers to native segments, not individual words. FluidAudio uses word timings with offline diarisation. Review these different granularities before comparing apparent speaker quality.

## Verification

```sh
bun run test
bun run typecheck
bun run lint
bun run test:e2e       # Requires the Studio dev server and installed Google Chrome
bun run build
bun run test:production
```

E2E fixtures are synthetic and intercept source/run requests; production checks use an isolated temporary state directory. Builds have a separate generated cache so verification does not overwrite the running dev server's layer aliases. Reload the browser after a service restart.

Production can still run on Bun: `bun run preview`. The Node-compatible Nitro preset preserves the peer socket for loopback checks; the Bun preset's internal localFetch adapter does not expose it.

CUDA/Windows workers and a richer transcription workflow can use the same adapter/result boundary later. No .NET or CUDA toolchain is installed for this Studio.
