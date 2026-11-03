# Conservative transcript processing and settings

## Boundaries
- `shared/speakerCondensing.ts`: bounded, non-cascading contextual word ownership; preserve explicit interjections, overlap conflicts, unbounded fragments and long pauses.
- `shared/transcriptProcessing.ts`: five independent defaults/flags: same-speaker grouping, short-gap bridging, unlabelled-fragment inference, weak speaker-island correction, coherent plain copying.
- `shared/speakerSegments.ts`, `shared/transcriptPassages.ts`, `shared/transcriptText.ts`, `app/utils/transcriptHighlight.ts`: use the same assignments and flags for display, highlights and clipboard. Keep native results/timings unchanged.
- `WorkspacePreferences`, workspace SQLite store/manager/API and Pinia: persist flags inside existing preference JSON, normalise missing flags on read, preserve flags on unrelated preference writes.
- `ProcessingSettings.vue`: focused toggle section; `SettingsView.vue` composes it as a third keyboard-accessible tab. Both review surfaces consume the same Pinia preferences.

## Verification slices
1. Synthetic unit fixtures: merge short unlabelled fragments, resolve supported change-boundary fragments, override only weak 1–3 word islands; preserve strong interjections, overlaps, long pauses, legacy alignment, exact text and timings. Test flags independently and highlights/copy consistency.
2. SQLite tests: missing flags migrate to defaults, false survives reopen and unrelated preference updates, invalid API values rejected.
3. Desktop Playwright: toggle all settings, refresh and restore; grouped transcript and copied labels react without inference. Check Settings keyboard navigation and browser console/network with synthetic fixtures.
4. Run `bun run test`, `bun run typecheck`, `bun run lint`, `bun run test:e2e`, `bun run build` and isolated `bun run test:production`.

No private transcription/inference, source audio edits, commits or pushes.

## Implemented decisions and evidence
- All persisted feature switches default to false and use `Disable …` labels for baseline-on rules. Runtime positive options are derived, not separately persisted. Missing older preferences normalise on read; unrelated preference writes preserve flags.
- Unlabelled fragments: ≤3 words / 1.5 seconds; speaker islands: ≤3 words / 1.2 seconds. Neighbour gaps ≤0.75 seconds, entire bounded interval ≤2.5 seconds. Islands require original labels agreeing with both neighbours, a short competing turn and <60% coverage of each word. Strong explicit interjections are retained.
- Later screenshot revealed a two-speaker overlap tie at a source-segment boundary and a 1.36-second uncovered fragment. A tie now resolves only when the source label and an owned adjacent word in that same segment agree and overlap contains exactly the two bordering speakers. No cascading guesses or third-speaker conflict resolution.
- Read-only numeric validation: 7,834 timed words retained, exact joined text unchanged, zero label/highlight conflicts; the example now has one Speaker 1 passage from 505.56 to 516.76 seconds. Total passages: 424.
- Both daily and benchmark review hydrate the same Pinia preferences. Synthetic MCP reproduced missing benchmark hydration, then verified persisted grouping opt-out on direct load, toggle navigation and restoration with no console/network errors.
- Playback backdrop uses neutral-950, Tailwind `animate-pulse` at 4 seconds and an independent 700ms fade wrapper; reduced motion disables pulse/transitions. Benchmarks added to main navigation.
- Broad verification: 113 unit tests, 54 E2E tests, typecheck, lint, production build and isolated production smoke passed. Smoke additionally verifies all-false defaults, processing API validation and flags across SQLite/server restart.
