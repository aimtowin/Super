# Consented App Update Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Super check for updates automatically but only download after the user explicitly approves, preserve a verified installer for deferred installation, and confirm successful updates in the new version.

**Architecture:** The main process checks the ECS feed after startup and sends an available-update event without downloading. A user-approved download is checksum verified and staged under the per-user update cache, with a small JSON record describing the staged installer. On a later startup, the old application launches that staged installer and exits; the installer starts the new application with `--updated`, which consumes a one-time completion notice for the renderer.

**Tech Stack:** Electron IPC, TypeScript, Zod protocol schemas, Node filesystem APIs, React renderer, Vitest.

---

### Task 1: Define update lifecycle protocol

**Files:**
- Modify: `src/shared/app-update.ts`
- Modify: `src/shared/protocol/channels.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/app-update-service.test.ts`

**Step 1:** Add typed payloads for available, staged, and completed updates, plus `downloadUpdate()` and `getCompletedUpdate()` bridge operations.

**Step 2:** Add parser tests that reject malformed lifecycle payloads.

**Step 3:** Run `npx vitest run --config vitest.config.ts tests/unit/app-update-service.test.ts`.

### Task 2: Persist verified Windows installers

**Files:**
- Create: `src/main/pending-app-update.ts`
- Modify: `src/main/app-update-service.ts`
- Test: `tests/unit/pending-app-update.test.ts`

**Step 1:** Write failing tests for safe state-file parsing, cache-root containment, and clearing records.

**Step 2:** Stage installed-update archives and extracted installers in the Super update cache rather than Downloads/temp.

**Step 3:** Persist only an already verified installer path, version, and bounded release notes; restore it on the next process start only when it stays inside the cache root.

**Step 4:** Run the focused unit tests.

### Task 3: Change main-process update sequencing

**Files:**
- Modify: `src/main/index.ts`
- Test: `tests/unit/app-update-service.test.ts`

**Step 1:** Replace startup auto-download with an available-update notification.

**Step 2:** Let the explicit renderer action stage the update, persist the record, and emit the ready notification.

**Step 3:** On the next startup, launch only the persisted verified installer, write a one-time completion notice, and exit the old app.

**Step 4:** Clear state after launch/failure as appropriate; do not discard a deferred update during ordinary shutdown.

### Task 4: Build the consented UI

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/i18n/catalogs/zh-CN.ts`
- Modify: `src/renderer/i18n/catalogs/en.ts`
- Modify: `src/renderer/AboutDialog.tsx`

**Step 1:** Show a compact lower-left “new version available” prompt with an explicit download button.

**Step 2:** Replace it with a compact determinate download progress bar while staging.

**Step 3:** Show restart-now and later choices after verification; later only dismisses the UI, retaining the staged update.

**Step 4:** Fetch and display a one-time floating completion notice, including the version and release notes, in the newly launched application.

### Task 5: Verify and release

**Files:**
- Modify: affected source/tests only

**Step 1:** Run focused update tests, lint for edited files, `npm run typecheck`, and `git diff --check`.

**Step 2:** Build a new test release, publish it to ECS, and verify the manifest, download size, and SHA-256 before testing with the prior installed version.
