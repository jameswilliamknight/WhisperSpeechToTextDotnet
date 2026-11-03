# Agent Guidelines

## UI verification

- This is a desktop-only application. Test the UI at desktop viewport sizes.
- Do not spend time implementing or testing mobile layouts or mobile viewport sizes unless explicitly requested.
- Scrollbars should be hidden until the pointer hovers over their containing area/column, then fade in/out over approximately 200ms. Reserve a stable gutter and comfortable content spacing so visibility never shifts layout. Keep native wheel, keyboard and thumb-drag behaviour; disable the fade for reduced-motion preferences. Reuse the studio's shared `scrollbar-area` / `hover-scrollbar` styles instead of per-component implementations.
- Do not turn ARIA selection/state or pointer/modal focus restoration into bright outlines around rows, lists or panels. Preserve ARIA semantics and keyboard accessibility, using a subtle background/underline on the actual focused control instead of a large blue outline. Progress panels use neutral borders; changing timers/percentages use tabular numerals in reserved-width slots to avoid layout movement.
- Do not introduce layout shifts for loading, status, error, or incidental informational text. Never insert/remove a text banner that pushes the surrounding interface around (for example, “Loading local workspace”). Use reserved geometry, an existing status slot, or a non-obstructive overlay; retain accessible live-region feedback where useful without changing content placement.

## Imports and module boundaries

- In the Nuxt transcription studio, prefer `#shared/...` for shared modules, `~/...` for app modules, `~~/...` for project-root modules (including `harness`), and `#layers/freebore-ui/...` for UI layer components.
- Use short relative imports for siblings or tightly colocated modules. Avoid multi-level `../../...` imports when a Nuxt alias expresses the boundary clearly; update these imports in files being materially changed rather than doing unrelated repository-wide churn.
- Standalone workers/scripts must remain runnable outside Nuxt: use imports their own runtime can resolve, and verify Bun tests plus the production Nuxt build after alias changes.
- Keep orchestration thin and extract focused modules/components as responsibilities grow. Derive UI projections from existing persisted state rather than adding redundant Pinia caches or SQLite tables.
