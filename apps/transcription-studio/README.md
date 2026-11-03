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

- Drop an audio file onto the Transcribe page or use **Choose file**, then **Transcribe**. Alternatively configure a source directory in **Settings** and use a row's **Transcribe** icon button. Both run the full Whisper pipeline including speaker diarisation. Source browsing is read-only; originals are never converted in place or passed to a native worker.
- **Recordings** combines source files and history in one row per file. It shows the newest status, file size, friendly/exact dates and a **Retranscribe** icon after any attempt. Retranscription requires confirmation, creates a fresh private input copy and keeps prior results/exports. A missing original disables retry but does not hide the existing transcript. Uploaded files can be retried from their retained private input; re-uploading identical bytes prompts before inference.
- Progress and timeline occupy the same top panel, never both. Processing hides the previous text/audio/timeline; failure or cancellation restores the last successful result if one exists. Progress uses fixed-width tabular elapsed/percentage fields, a separate audio-length slot, and a left-aligned stage label. Whisper's percentage is ASR only; diarisation deliberately uses an indeterminate bar rather than a fabricated estimate. Worker “Complete” remains **Finishing** until success is durably committed, then **View transcript** acknowledges completion and reveals the new result.
- The transcript panel fills the remaining desktop viewport height and scrolls internally, with a usable minimum height. The outer page gains its own scrollbar only when the window is too short to fit the workspace.
- **Settings** also controls the working directory for intermediate files and the output directory for text exports. Use separate absolute paths. Source may be blank if you only use drop/file-picker uploads.
- Each job retains its own locations. Changing settings does not relocate or remove earlier jobs, and is blocked while a job is active.
- Click a recording with a successful transcript to review/copy it. Inactive rows do not pretend to be interactive; **Viewing transcript** replaces selection outlines. Recordings and transcript scroll independently with reserved gutters and scrollbar thumbs that fade over 200ms only while their containing area is hovered (instant under reduced motion). Completed jobs produce `.txt` and `.speakers.txt` exports without overwriting previous files.
- Settings, job history, selected transcription and copy preference remain in ignored `.local/workspace.sqlite`; unified rows are derived rather than persisted in another table/cache. Opaque identities distinguish source paths and uploaded content, not filenames alone. Legacy uploads retain conservative per-job identities until explicitly retried. Completion acknowledgement, playback and selected browser files are transient; confidential text is not stored in browser localStorage.
- Daily-transcription speaker names live in portable `<job-id>.metadata.json` beside the text exports, using stable raw speaker IDs. Renames atomically replace this private sidecar and refresh `<job-id>.speakers.txt`; plain text, raw results and audio do not change. A missing speaker export is recreated. Each job uses its original output directory, not current Settings.
- Older SQLite speaker mappings migrate on access (or explicit maintenance), and are removed only after the sidecar and labelled export are durable. An existing valid sidecar is authoritative. Invalid, symlinked, unavailable or unwritable output files prevent migration and retain legacy database names for retry; do not delete the database before resolving failures. Metadata is authoritative if a failure interrupts text refresh, which is repaired on subsequent access. Keep sidecars with exports when backing up or moving files; moving them does not automatically relocate history. Private SQLite backups may still contain pre-migration names.
- The initial source directory is unset. Working files and text exports default to ignored `.local/work/` and `.local/transcripts/`. Custom external directories remain your responsibility for backups and access control.

The earlier experiments and measurements remain intact at `/benchmarks`, but backend choices and benchmark controls are not part of the daily transcription page. Whisper still requires the shared Nemotron diarisation model; other transcription engines are not used by the new workflow.

### Job coordination and maintenance

Timeline edges use one native scrolling canvas, widened behind a fixed pointer-blocking speaker-label overlay. The real turns fade beneath the labels—never copied turns synchronized through scroll events—so scrolling and whole-segment hover highlights stay seamless. The clickable rail and its zero-time origin remain unchanged; `Start · 0:00` labels that origin. A right-edge mask appears only while more content is available to the right, clearing at the end or in fitted mode. During playback a translucent charcoal backdrop pulses over six seconds, with a separate one-second opacity fade on play/pause; reduced-motion preferences disable both animations. **Settings → Playback → Disable playback pulse** replaces the pulse with static very dark grey, retaining the fades. This performance opt-out defaults to false and persists in SQLite.

Transcribe, Benchmarks and Settings are statically imported and eagerly warmed into a three-entry app-level KeepAlive cache. Navigation retains detached component trees, audio elements, unsaved Settings edits and timeline expansion per identity rather than downloading/rebuilding them again. Inactive screens cannot autoplay or own Space; returning restores their playback intent. This intentionally trades initial-load memory for fast subsequent navigation. Benchmarks refresh on startup, explicit Refresh and every 1.5 seconds during an active run, not while idle. Loading/status text must not shift surrounding content; see root `AGENTS.md`.

Continuous follow uses the media clock, not a second easing clock. A fractional CSS translation compensates when native scrolling rounds to device pixels; AutoAnimate remains responsible only for discrete expand/collapse. Stable transcript rows and turn lanes use Vue `v-memo` so the frame-rate clock does not rebuild their controls. An 8,000-word/400-turn synthetic test reduced main-thread task time over 90 sampled frames from about 4.64s to 0.62s on this machine; this is diagnostic evidence, not a cross-device FPS guarantee. A separate interactive browser check measured approximately 16.67ms frame intervals and less than 0.01px centred-playhead wobble. See `test/e2e/timeline-motion.spec.ts` for repeatable geometry checks and attached numeric performance metrics.

Settings → Transcript exposes five independent opt-outs: same-speaker grouping, short-gap bridging, contextual unlabelled-fragment condensing, weak speaker-island correction, and flowing plain copies. All switches default to **false** (off); turning one on disables the named rule. Pinia owns the reactive preferences and the existing SQLite preferences record persists them, including across server restarts. Both review surfaces and clipboard copies use the same options. Native timing and label/highlight consistency are invariants, not switches.

Contextual condensing uses at most three uncertain words and 1.5 seconds for unlabelled fragments (1.2 seconds for speaker islands), with at most 0.75-second gaps to each owned neighbour. At a speaker change, the original segment label and an owned adjacent word in the same segment must agree. Only a tie between those two bordering speakers can be resolved; third-speaker conflicts remain explicit. A speaker island additionally needs matching original segment labels and less than 60% competing-turn coverage of every word. Strong short interjections survive. Corrections are one non-cascading, read-only pass: inferred assignments never become new evidence, and saved results/audio are untouched.

Playback position and playing/paused intent live in a dedicated Pinia store, persisted locally under `studio.playback-position`. Daily review uses the recording identity (falling back to the job ID for older results); benchmark runs have separate keys. Restoration waits for media metadata, clamps to its duration, and lets the existing transcript-follow logic reveal the current passage. A playing refresh checks for actual clock advancement every 250ms for at most three seconds, retrying transient startup interruptions without concurrent play requests or losing intent to an initial pause event. Explicit pause, navigation and disposal cancel recovery. Browser autoplay refusal stops retries and keeps the position and Play control usable without claiming an audio failure; site-level permission cannot be bypassed. This recovery is tested with synthetic interruptions in Chrome; Vivaldi-specific behaviour remains unverified directly. Writes are coalesced to 500ms and flushed on pause, selection changes, disposal and page hide. Only opaque identities, seconds and playback intent are stored—no transcript text, paths or audio.

Implementation references: [FormKit AutoAnimate scope](https://auto-animate.formkit.com/#usage), [compositor-friendly animation guidance](https://web.dev/articles/animations-guide), [Vue update optimizations](https://vuejs.org/guide/best-practices/performance.html#update-optimizations), [media play promises and autoplay policy](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play), and [Vivaldi site permissions](https://help.vivaldi.com/desktop/privacy/website-permissions/).

Speaker-labelled passages and copying use the same timed-word/diarisation ownership as phrase highlighting. A real timed speaker change inside an ASR segment splits the displayed passage; adjacent words from the same speaker remain grouped. Wholly uncovered words inside gaps of at most 1.5 seconds inherit the surrounding speaker only when both bounding turns agree, including tied boundaries. This conservative presentation inference avoids tiny unlabelled rows without bridging long pauses or extrapolating at recording edges. Contextual condensing can resolve a bounded two-speaker tie when the original segment label and adjacent owned words agree; inside a continuing sentence both neighbours must belong to that same source segment. Missing labels, disagreement or a third speaker leave ambiguity explicit. Bridged words use an existing turn for phrase/tooltip ownership; playback activation and native turn times are not extended into gaps. Legacy/stale alignment retains its segment labels without inventing word timings. This is a read-only projection, not a correction of the diariser: native results and existing exports are untouched, and plain copying retains coherent sentence flow.

Automatic recording-update reconnects preserve the current list and show a muted, horizontally centred top-nav status only after 1.5 seconds. Recovery/navigation clears it immediately. Genuine folder/read errors remain actionable within Recordings; a transient SSE interruption is not presented as a red list error.

Each daily job is coordinated by a separate checkout-owned Bun process (`tool/run-workspace-job.ts`), not a Nitro request worker. Native-admission ownership transfers durably before a stdin gate permits execution. This preserves process reaping, cancellation, exports and terminal status across dev-server reloads. Cancellation waits for durable terminal state and lease release; unknown/live native process groups continue to fence admission. Vue development warnings suppress transcript-bearing prop traces.

`bun tool/clean-failed-history.ts` is explicit idle-only maintenance: it makes a private consistent SQLite backup, removes only failed history rows, repairs a removed selection and verifies successful records are byte-for-byte unchanged. It does not delete audio, working directories or exports. `bun tool/recover-completed-job.ts <job-id>` is an explicit recovery tool for a stranded completed result after the former owner/native group have exited; it backs up SQLite, validates saved output and reuses normal integrity-checked exclusive finalisation without rerunning inference. Never clear a live worker fence to force either operation.

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
- Speaker renames are display annotations: daily jobs use output metadata sidecars; legacy benchmark runs keep annotations with their run record. Raw worker speaker IDs and benchmark results are not modified.

NeMo uses independent 60-second ASR chunks and reloads the model for each chunk; boundaries are not reconciled. Whisper assigns speakers to native segments, not individual words. FluidAudio uses word timings with offline diarisation. Review these different granularities before comparing apparent speaker quality.

### Phrase highlighting

New Whisper jobs request full native JSON and retain usable token-derived word timings as optional, versioned alignment on each transcript segment. Alignment is bound to the exact segment text and times; missing, invalid or stale alignment leaves the text neutral. These are Whisper's estimated timings, not manually verified boundaries. Token pieces are combined into whole words without evenly dividing sentence duration, and untimed words remain neutral.

Transcript passages remain coherent and neutral by default. The fine-grained timeline turn at the audio position colours its associated phrase; pausing preserves the position and seeking updates it. Hovering or keyboard-focusing a timeline block previews its phrase in the tooltip without moving the transcript's playback highlight. A subtle background/underline distinguishes playback from preview. Words use the greatest positive overlap with a raw speaker turn; equally overlapping different speakers remain neutral. This display-only mapping does not change saved segment speaker assignments, transcript text, or clipboard/export formatting.

Transcript following tracks the highlighted phrase even within long passages. Manual wheel, scrollbar or keyboard scrolling suspends following; **Follow playback** resumes it. Existing jobs are not silently retranscribed: older results without native word timings stay neutral. A new transcription is currently required to obtain these timings. Speaker-name sidecars remain names-only and are not used to store alignment.

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
