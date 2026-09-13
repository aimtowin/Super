# Incremental Update Delivery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prefer a verified ECS delta installer for the installed version, while retaining the existing full installer as a safe fallback.

**Architecture:** The ECS release document will expose a stable native manifest with a full artifact and optional source-version-specific delta artifacts. The client validates either the legacy API payload or the native manifest, selects a delta only when it exactly matches its installed version and platform, and otherwise selects the full installer. Delta installation reuses the existing verified ZIP extraction and deferred Inno restart flow, so checksum, cancellation, resume, and the full-package fallback remain uniform.

**Tech Stack:** Electron, TypeScript, Zod, Inno Setup, ECS release JSON, Vitest.

---

### Task 1: Model and validate ECS delta releases

**Files:**
- Modify: `src/shared/app-update.ts`
- Modify: `src/main/app-update-service.ts`
- Test: `tests/unit/app-update-service.test.ts`

1. Add an explicit `delta-installer` asset kind and the source-version metadata required to identify it.
2. Parse the native ECS `{ version, full, deltas }` manifest without loosening the existing URL, checksum, size, and semver validation.
3. Select only the delta whose `fromVersion` exactly equals the current installed version; otherwise retain full selection.
4. Run the update-service tests.

### Task 2: Preserve safe fallback and user-visible progress

**Files:**
- Modify: `src/main/app-update-service.ts`
- Modify: `tests/unit/app-update-service.test.ts`

1. Treat a delta archive as the same deferred Windows installer transport already used for full updates.
2. If a selected delta fails download, checksum, extraction, or staging, retry once with the verified full installer and report normal progress.
3. Keep full-installer behavior unchanged when a release has no compatible delta.
4. Add tests for delta selection and fallback dispatch.

### Task 3: Make future deltas materially small

**Files:**
- Modify: `forge.config.ts`
- Modify: `scripts/verify-package.mjs`
- Modify: `scripts/release/build-inno-delta.mjs`
- Test: `tests/unit/media-binaries.test.ts`

1. Stop using a monolithic ASAR as the file-level delta unit; package runtime files individually so an ordinary renderer or Worker change does not force the entire archive into a delta.
2. Keep native module unpacking and all package verification checks equivalent for the directory layout.
3. Ensure the delta generator includes only changed files, safely removes obsolete files, and rejects unexpectedly broad deltas in release automation.
4. Build a local package and verify the startup/import/FTS packaged smoke tests.

### Task 4: Verify delivery behavior

**Files:**
- Test: `tests/unit/app-update-service.test.ts`
- Test: `tests/e2e/packaged-startup.test.ts`

1. Run type checking, targeted update tests, package verification, and packaged smoke tests.
2. Record the full versus delta artifact size from a controlled two-build fixture; do not publish to ECS.
