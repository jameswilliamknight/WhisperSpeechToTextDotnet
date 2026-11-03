# Aligned playback highlighting

Approved: neutral passage text, speaker-coloured fine-grained phrase previews and playback highlighting, paused/seek retention, no copying changes. Preserve speaker-name sidecars and original audio.

## Boundaries
- `apps/whisper-experiment/wordTimings.ts`: convert real full-JSON token offsets to validated word character ranges; never interpolate words across a sentence.
- Whisper `asr.ts`/`normalize.ts`: request full JSON and retain optional versioned per-segment alignment. Bind alignment to exact source text and segment times.
- Studio `shared/studio.ts`, `shared/wordAlignment.ts`, result schema: optional portable alignment, exact-source validation, graceful neutral fallback.
- `app/utils/transcriptHighlight.ts`: precompute word-to-turn ownership and text ranges, shared by column and tooltip. Greatest positive overlap, ambiguous cross-speaker ties remain neutral.
- `HighlightedTranscriptText.vue`: escaped, layout-stable neutral/preview/playback spans. No HTML injection or clipboard changes.
- `SpeakerTimeline.vue`: lazy tooltip content with full sentence context and phrase preview; playback underline remains independent of hover.
- `TranscriptPanel.vue`/`TranscriptReview.vue`: neutral column, shared phrase rendering; keep existing playback clock and follow composable. Rename resume action to Follow playback.

## Slices and verification
1. Add synthetic parser tests for token pieces, punctuation, invalid/missing offsets and exact-text mismatch. Enable full JSON. Run Whisper Bun tests.
2. Add shared validation and highlight tests for adjacent turns, gaps, simultaneous speakers, stale text/times, punctuation, missing alignment and unchanged coherent copying. Run Studio unit tests.
3. Compose highlighting in tooltip and both review surfaces. Precompute ownership independently of the per-frame media clock; mount tooltip text only while open. Preserve keyboard focus and rename colours.
4. Add synthetic desktop Playwright cases for neutral fallback, preview versus playback, pause/seek, coherent copy, renamed speakers and follow controls. Run unit, typecheck, lint, desktop E2E and production build.
5. Inspect desktop browser console/network and re-click tooltip/playback paths. Do not expose private transcript in tool output. Existing jobs must not be silently retranscribed; evaluate an explicit exact-match alignment backfill separately if native timings were not retained.

No commit or push unless requested.

## Execution and QA
- Implemented optional exact-source word alignment and shared phrase renderer for daily jobs and benchmark review. Speaker-name metadata and coherent copying are unchanged.
- Existing follow behaviour now targets the highlighted phrase within tall passages. Manual browsing still suspends follow. Fixed an adjacent, browser-reproduced 8px expanded-timeline centring error; measured zero offset after correction.
- Read-only tooltip poppers no longer intercept playback controls. Reproduced the focus/Play obstruction in MCP before patching, then successfully re-clicked Play.
- Native public JFK sample: 22/22 whitespace-delimited words received usable native timing; no private audio processed. Older results lack retained token timestamps and are not silently retranscribed.
- Verification: 86 Studio unit tests, 33 desktop E2E tests, and 22 Whisper/NeMo tests passed. Typecheck and lint passed. Production build and isolated production API/restart checks passed after using Nuxt's shared alias for runtime shared imports.
- Desktop MCP screenshot/DOM checks at 1440x1000 confirmed neutral context, independent tooltip preview versus paused playback highlight, consistent speaker colour, no horizontal overflow, and zero console errors. Synthetic fixtures intercepted all APIs during interactive checks.
