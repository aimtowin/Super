# Conservative Package Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship v2.3.8 with verified build-only font duplication removed, without reducing application capabilities.

**Architecture:** Extend the existing Forge copy filter with a narrow package allowlist. Keep emitted Vite fonts, font licensing, all languages, React/Three/PDF/QuickJS and native media runtimes. Add a packaged CSS asset check and exercise the real packaged application, not only the development dependency tree.

**Tech Stack:** Electron Forge, Vite, TypeScript, Vitest, Playwright, Inno Setup, existing ECS/GitHub release pipeline.

---

## Approved scope and baseline

- User approved conservative cleanup followed by packaging/publication; no additional design approval is needed.
- Existing quick-start guide changes are preserved and tested for this release; existing historical test failures are documented, not repaired by this task.
- v2.3.7 baseline: installed package 662.15 MiB; installer 240,989,949 bytes. Identical duplicated font files: 528, totaling 27.645 MiB; unused source font variants add further duplication.
- Do not change runtime compression formats, ASAR policy, media binaries, language coverage, database behavior or server configuration.
- Keep the current workspace to preserve the approved uncommitted guide; do not reset or stash user work.

## Task 1: Regression tests for the copy policy

**Files:** Create `tests/unit/package-pruning.test.ts`; modify `forge.config.ts`.

1. Add table-driven tests proving raw font binaries/CSS and font-build tool payloads are omitted.
2. Add tests preserving Vite fonts, license notices, package metadata, SQLite/Canvas/Sharp/PDF/QuickJS/Three and unrelated similarly named packages.
3. Run `npx vitest run tests/unit/package-pruning.test.ts` and confirm the new removal assertions fail before implementation.
4. Add a narrow copy filter covering the three bundled font packages and cn-font-split/woff-build payloads only; rerun tests.

## Task 2: Validate copied assets

**Files:** Modify `scripts/verify-package.mjs`; add packaged regression coverage in `tests/e2e/packaged-startup.test.ts`.

1. Check every relative CSS URL in the emitted renderer against the actual packaged files.
2. Confirm no raw font payload survived, and native font rendering and media runtimes remain present.
3. Exercise packaged font loading, creation/import/search and PDF/3D previews; update fresh-profile tests to explicitly dismiss the new guide where it is not under test.
4. Run `npm run typecheck`, `npm run lint`, targeted Vitest and quick-start E2E. Run packaged tests after packaging.

## Task 3: Release

**Files:** Modify `package.json`, `package-lock.json`; create `docs/releases/v2.3.8-validation.md` and release notes.

1. Bump version to 2.3.8; preserve v2.3.7 measured baseline.
2. Use package/media checks and packaged E2E gates. Do not silently bypass or label known full-suite failures as passing.
3. Build Inno installer, retained direct deltas, baseline and checksums; compare actual package/install sizes.
4. Commit only reviewed release changes; publish ECS with existing retention (5 complete releases, up to 20 delta sources), and GitHub release/tag/source.
5. Read back remote versions, assets and checksums. Report measured savings, verification scope and any limitations.
