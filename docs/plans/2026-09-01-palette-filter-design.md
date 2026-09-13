# Unified Palette Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the colour filter query every representative colour in an asset, present a usable visual palette, and render Inspector swatches proportionally.

**Architecture:** Persist a normalized, revision-scoped palette index alongside the existing JSON palette artifact. New extractions write all representative colours atomically. Existing artifacts receive a primary-colour compatibility row in the migration and are expanded incrementally in bounded batches, preserving startup responsiveness. The renderer selects finer hue presets from a compact palette grid; the Worker matches any indexed representative colour.

**Tech Stack:** Electron, React 19, TypeScript, better-sqlite3, Sharp, Vitest.

---

### Task 1: Define palette colour metrics and filter SQL

**Files:**
- Modify: `src/worker/palette-extractor.ts`
- Modify: `src/shared/color-filter-presets.ts`
- Test: `tests/unit/palette-extractor.test.ts`
- Test: `tests/unit/color-filter-presets.test.ts`

1. Write assertions for HSL saturation, a richer hue-preset catalog, and an `EXISTS` query that applies colour constraints to any indexed colour.
2. Implement deterministic HSL metrics and 24 hue/neutral presets with stable ids and CSS swatches.
3. Make colour SQL accept indexed palette columns, including null-safe exclusion semantics.
4. Run the two unit test files.

### Task 2: Persist and progressively backfill the per-colour index

**Files:**
- Modify: `src/worker/library-service.ts`
- Test: `tests/worker/palette-artifact.test.ts`
- Test: `tests/worker/search.test.ts`

1. Add a migration creating `palette_color_index` and seed historical ready artifacts with their existing primary colour metrics.
2. When extraction completes, insert every extracted colour (hex, ratio, hue, saturation, lightness) in the same database transaction as its artifact.
3. Add a bounded backfill that reads old JSON artifacts and replaces only compatibility rows; invoke it after normal media queue waves and a colour search without scanning the full library synchronously.
4. Change colour search to `EXISTS` over the current revision's palette entries; retain an indexed primary-colour fallback for old libraries.
5. Run palette and search Worker tests.

### Task 3: Replace the fixed dots with a usable palette and proportional Inspector strip

**Files:**
- Modify: `src/renderer/DimensionFilterBar.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/i18n/catalogs/zh-CN.ts`
- Modify: `src/renderer/i18n/catalogs/en.ts`
- Test: relevant renderer/unit coverage if present

1. Render the hue catalogue as a labelled palette grid with accessible selection state; retain Shift multi-select and exclusion.
2. Show selected colour names/count and keep the popover compact on narrow windows.
3. Set Inspector swatch flex basis from extracted ratios, with a small minimum width for discoverability.
4. Run typecheck, targeted tests, ESLint, and a visual dev build check.
