# Filter Interaction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make include/exclude filtering discoverable and consistent without changing query semantics.

**Architecture:** Use a reusable native radio mode control and a sticky filter header. Active chips carry a semantic `excluding` flag rather than embedding punctuation in values; More derives its exclusion state from active chips. Keep all existing parent state and backend queries intact.

**Tech Stack:** React, TypeScript, existing CSS tokens, Vitest/happy-dom, Playwright/Electron.

---

User approved implementation in this checkout. Preserve unrelated changes. No worktree, commits, release, or external writes are needed. Follow @Code and @impeccable guidance; the reviewed design is `2026-10-07-filter-interaction-design.md`.

### Task 1: Semantic summaries

Files: `src/renderer/active-discovery-filters.ts`, `tests/unit/active-discovery-filters.test.ts`.

1. Assert `{ detail: "png, jpg", excluding: true }` for an excluded format and preserve empty snapshot behavior. Add coverage of every negatable dimension and AI status labels.
2. Run `npx vitest run tests/unit/active-discovery-filters.test.ts`; new assertions should fail before implementation.
3. Add optional `excluding` metadata. Keep values unmodified and localize status via label keys. Do not change query code.
4. Run the same command; all assertions should pass.

### Task 2: Unified controls

Files: `src/renderer/FilterModeControl.tsx`, `src/renderer/TechnicalRangeFilter.tsx`, `src/renderer/DimensionFilterBar.tsx`, `src/renderer/FilterPresetChips.tsx`, both `src/renderer/i18n/catalogs/{zh-CN,en}.ts`, `src/renderer/styles.css`, `tests/unit/dimension-filter-bar.test.ts`.

1. Write happy-dom tests for disabled mode on empty values, semantic labels, preset-only shape exclusion, stale More exclusions, clear actions and locked controls. Verify failures.
2. Implement native radios with `useId`, localized labels, and disabled state. A sticky header owns mode and hints; individual range groups use separate labelled controls. Shape top-level mode uses `shapeActive`, not only manual inputs.
3. Render excluded chip labels explicitly; use actual label keys for all chip summaries. Derive More exclusion only from active negated fields.
4. Add scoped exclusion styles, keyboard focus, and useful single/Shift click copy. Rename selection command to “反选资产” without changing selection behavior.
5. Run `npx vitest run tests/unit/dimension-filter-bar.test.ts tests/unit/active-discovery-filters.test.ts tests/unit/dimension-filter-selection.test.ts tests/unit/dimension-enable-toggle.test.ts tests/unit/filter-presets.test.ts tests/unit/invert-selection.test.ts`.

### Task 3: Real application regression

File: `tests/e2e/filter-interaction.test.ts`.

1. Launch an isolated temporary library, import small PNG/JPG/text fixtures, and test inclusion/exclusion results and additive Shift selection. Test group partial state, scrolling, clear chips, keyboard and themes.
2. Run `node scripts/run-e2e.mjs tests/e2e/filter-interaction.test.ts tests/e2e/organization-search-trash.test.ts` (production-like development build, not a release package).
3. Inspect generated screenshots. Fix layout or interaction regressions before delivery; keep fixtures isolated from the user's libraries.

### Task 4: Final checks

1. Run `npm run typecheck` and `npm run lint`.
2. Run related filter/schema/selection unit tests and review `git diff --check` plus the final diff.
3. Record exact verified results and remaining limitations here; do not claim a newly installed/released version.

## Verification record — 2026-10-07

- Implemented the approved lightweight design: sticky native include/exclude radios, semantic exclusion chips, unified selection styling, labelled independent range controls, accurate Shape/More status and actual favorite/source/availability/AI chip labels. Asset inversion remains scoped to the current filtered browse scope.
- Added empty/locked-state, preset-only OR shape exclusion, per-dimension controls, actual labels, localization and clearing coverage. Fourteen related Vitest files: **105 passed**.
- Production-like Electron build plus `filter-interaction.test.ts` and `organization-search-trash.test.ts`: **5 passed**. Covers real query results, native radio arrow keys, Shift accumulation, group partial selection, single-click replace/clear, filter pause/restore, asset inversion, clearing, smart collections, batch organization/trash/restore/permanent delete and critical confirmations.
- The older organization fixture needed to dismiss first-run onboarding and stop expecting an obsolete auto-open settings dialog after inline smart-collection creation. Only test setup/expectations changed; smart-collection implementation was not modified.
- Visual checks inspected dark, light, scrolled and 1000px-wide/1.25-font-scale screenshots. Tests reject horizontal overflow and require at least **4.5:1** contrast for the selected exclusion mode, selected format chips and excluded summary. Corrected shared-surface padding precedence and slightly darkened light-theme exclusion text.
- `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Existing build chunk-size warnings and the lint Babel large-file informational note remain; no full repository suite claim is made.
- Package version remains **2.3.15**. No installer/package/release/Git push/ECS changes. Pre-existing dirty docs preserved; temporary test libraries were removed by their fixture cleanup.
