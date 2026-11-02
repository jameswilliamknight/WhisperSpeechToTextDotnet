# TODO: Extract Transcription Studio into a public repository

## Goal

Create a minimal, self-contained public repository at `~/src/transcription-studio`, with fresh Git history, containing the desktop transcription application we use today. Keep this repository intact as the home of the original .NET prototype and speech-engine experiments.

This is a deferred plan, not an instruction to publish the current repository or copy its private local state.

## Intended scope

Keep:

- The daily transcription workspace and Settings page.
- Audio file selection, drag and drop, recording-folder watching, local transcription and cancellation.
- Persistent settings, transcription history and exports, starting with an empty workspace.
- Speaker diarisation, speaker renaming and consistent speaker colours.
- Timeline playback, seeking, fitted/expanded views, view persistence and transcript following.
- Copy preferences, keyboard controls, accessible tooltips and desktop layout.
- Only the native worker, model setup, runner and safety infrastructure needed to make that workflow work.
- Relevant synthetic tests, production verification and a standalone installer/launcher.

Remove:

- Benchmark pages, navigation, comparison tables, benchmark-only API routes, CLI commands and metrics.
- Unused engine adapters and experiments, the .NET application and unrelated historical documentation.
- Dependencies, fixtures and scripts used only by removed features.

Do not mistake shared infrastructure for benchmark-only code: job ownership, cancellation/process-group fencing, result normalisation and audio preparation may also serve daily transcription. Trace dependencies before deleting them.

## Decisions before implementation

### 1. Resolve `freebore-ui`

The current app uses the sibling checkout when available and otherwise loads a GitHub Nuxt layer. A public application must install and build without private repository access, a GitHub token or an existing sibling checkout.

Choose one approach explicitly:

- **Public dependency:** use a publicly accessible, versioned layer/package, after confirming its licence and clean-machine installation.
- **Vendor the required subset:** copy only the primitives, tokens, styles and utilities the app actually uses. Include transitive dependencies, required Floating Vue styles, licences and attribution. Replace layer-specific aliases with app-local imports. Decide how future upstream fixes will be tracked.
- **Replace the layer:** implement or adopt an appropriately licensed public UI dependency, preserving the current appearance, keyboard behaviour and accessibility.

Record the chosen approach and maintenance trade-offs near the resulting UI integration. Do not copy the entire layer or publish private shared code without reviewing ownership and licensing. Do not retain a silent local-sibling fallback that hides missing public dependencies.

### 2. Choose the supported engine and platform

Start with the currently working Whisper transcription and speaker-diarisation path; inspect its actual dependencies before choosing which native files to extract. Document the supported platform, required toolchain and any acceleration assumptions rather than implying unverified cross-platform support.

Review licences and redistribution/download requirements for worker code, Python/Swift packages, Whisper weights and diarisation models separately. Prefer explicit setup/download instructions over committing models or prebuilt binaries. Decide whether the existing adapter abstraction still earns its place with only one supported pipeline.

### 3. Choose the public project contract

- Confirm the GitHub repository name, owner, visibility and licence before publishing.
- Retain Bun unless there is a concrete reason to change runtime/package manager during extraction.
- Decide the launcher name, local port and state-directory defaults. Avoid silently replacing the existing `transcribe` command or colliding with the running original app.
- Keep the existing app and its data untouched. Treat importing old jobs/settings as an optional, separately reviewed migration, not part of the public source copy.

## Extraction checklist

1. Inventory the daily workflow's dependency graph: app components, composables, stores, shared types, server routes, workspace persistence, runner, workers and setup scripts.
2. Identify every path or assumption reaching outside `apps/transcription-studio`, including native worker locations, model paths, launchers, configuration generators and UI-layer imports.
3. Create `~/src/transcription-studio` without copying `.git`. Copy an explicit allowlist of source files, not the existing directory tree with ad hoc exclusions.
4. Move the app to the new repository root. Give retained engine code and setup scripts clear local homes; update all relative paths and launcher identity checks.
5. Remove benchmark surfaces and unused code while preserving the daily runner's safety guarantees. Split overly broad modules where removing benchmark responsibilities exposes a useful boundary.
6. Implement the selected UI dependency strategy and verify there are no private or sibling-checkout requirements left.
7. Regenerate the dependency lockfile and adapt the retained synthetic tests and production smoke checks to the standalone layout.
8. Add ignore rules **before** running the app or downloading models. Keep private configuration, SQLite databases and sidecars, audio, transcripts, worker logs/results, caches, build outputs, virtual environments and model downloads out of Git.
9. Start with empty local state and synthetic fixtures. Never copy the current `.local` directory, recording-folder configuration, renamed speakers, real job metadata or transcripts.
10. Initialise a new Git repository only after reviewing the source set. Do not import the old commit history.

## Sanitisation and public-release review

Review both tracked files and everything staged for the first commit:

- No real recordings, transcript text, screenshots of private conversations, job databases or exports.
- No credentials, tokens, `.env` files, private URLs, sensitive logs or embedded local configuration.
- No real recording filenames, source fingerprints or other metadata carried over from local runs.
- No accidental model downloads, generated binaries, caches or bundled dependencies.
- Synthetic fixtures are genuinely synthetic, not excerpts from the owner's recordings.
- Personal names, email addresses and example filesystem paths are not the owner's main concern, but remove unnecessary machine-specific assumptions for portability.
- New screenshots must use synthetic/demo data and contain no personal browser chrome or local paths.

Scan source contents as well as filenames. Review Git author metadata intentionally; fresh history prevents old content from being exposed, but does not automatically sanitise copied files. Inspect the staged diff before the first commit and the files in the public repository after pushing.

## Public README and project presentation

Use `~/src/virizuals/README.md` as the presentation reference, not as boilerplate to copy blindly:

- A centred title, concise tagline and short explanation of the app.
- Accurate badges and navigation links; no broken CI badges, nonexistent demo links or unsupported claims.
- A polished screenshot made with synthetic audio/transcript data.
- A compact feature overview focused on the transcription workflow, not the experiments that produced it.
- Copy-pasteable installation, native engine/model setup and launch instructions from a clean checkout.
- Explicit runtime, OS, hardware and disk-space requirements, including first-run model downloads.
- A short architecture overview and focused development/test commands.
- Clear privacy boundaries: local processing, storage locations, network activity during setup, trusted native dependencies and loopback access controls. Do not describe these as encryption or sandboxing.
- Explain that recognition and speaker assignments can be wrong; no unsupported accuracy guarantees.
- Licence, third-party attribution, contribution and security-reporting guidance appropriate to the project.

Add a licence only after ownership and dependency compatibility are confirmed. If adding CI or pull-request templates, use the relevant workflow skills and keep the infrastructure proportionate to this small local application.

## Verification and publication

- Install and build from a clean checkout with no sibling repositories, pre-existing local state or private GitHub credentials.
- Run focused checks during extraction. Before publication, cover all retained functionality affected by the layout/dependency changes, plus production build and isolated production smoke tests.
- Use the desktop Playwright loop to verify synthetic upload/transcription results, history selection, cancellation, settings persistence, copy preferences, speaker renaming, playback, seeking, transcript following, timeline view restoration/reset, endpoint marker visibility and tooltip positioning without page overflow.
- Verify native setup and at least one real end-to-end transcription locally without committing its input, output or logs. If platform/model access prevents this, document the limitation rather than claiming it passed.
- Confirm the new installer does not overwrite another command and the new instance cannot accidentally open the original app's state or reuse its running server.
- Review the final staged file list, source scan, licence notices and README instructions.
- With explicit publication approval, create the confirmed public GitHub repository, commit the sanitised source and push. Do not change this repository's visibility.
- Finally, add a link from this repository's README to the new application without deleting the original experiments.

## Done when

A stranger can clone the public repository, follow its documented setup, and run the desktop transcription workflow without private dependencies or access to the owner's files. The public history contains only reviewed, sanitised source and synthetic examples; this original repository and its local data remain unchanged.
