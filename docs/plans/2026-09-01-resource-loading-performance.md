# Resource Loading Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the first resource page render independently of sidebar work, then reduce repeated linked-folder, smart-collection, and large-layout work without changing library data or navigation behavior.

**Architecture:** Treat the first browse page as the critical rendering path. All counts and sidebar metadata are a separately guarded hydration phase. Keep the single SQLite worker responsive by caching low-priority summaries, batching linked-folder covers, and fetching virtual-layout data in bounded chunks.

**Tech Stack:** Electron, React, TypeScript, SQLite worker, Vitest, Playwright.

---

### Task 1: Separate the critical browse page from sidebar hydration

**Files:**
- Modify: `src/renderer/App.tsx`
- Test: `tests/unit/` focused renderer helper tests as applicable

**Steps:**
1. Keep the first `asset.search` request as the only blocking request for the initial page.
2. Apply the first page and clear the content loading state as soon as it succeeds.
3. Hydrate root/trash counts and sidebar summaries in a generation-guarded background task.
4. Preserve current sidebar values while refreshing and make non-critical hydration failures non-blocking.

### Task 2: Cache and defer smart-collection counts

**Files:**
- Modify: `src/worker/library-service.ts`
- Test: `tests/worker/`

**Steps:**
1. Cache smart-collection count summaries by library change sequence.
2. Recompute only after a mutation changes the library sequence.
3. Add a regression test proving repeated list requests reuse the cached result and a mutation invalidates it.

### Task 3: Batch linked-folder covers and suppress refresh storms

**Files:**
- Modify: `src/worker/library-service.ts`
- Modify: `src/renderer/App.tsx`
- Test: `tests/worker/`

**Steps:**
1. Fetch all direct-child linked-folder cover artifact/candidate IDs in bulk instead of two queries per child.
2. Keep existing cover selection semantics.
3. Debounce thumbnail-driven folder-card refreshes so a burst causes one reload, not one per thumbnail event.

### Task 4: Stream virtual layout in bounded chunks

**Files:**
- Modify: `src/renderer/use-browse-pagination.ts`
- Modify: `src/shared/browse-scope.ts`
- Test: `tests/unit/`

**Steps:**
1. Limit one layout RPC to a moderate chunk and request later chunks asynchronously.
2. Preserve existing first-page geometry and allow scrolling to request needed ranges.
3. Add tests for chunk boundaries and stale request protection.

### Task 5: Instrument, verify, package

**Files:**
- Modify: relevant renderer/worker performance logging only if needed
- Modify: `package.json`, `package-lock.json`

**Steps:**
1. Run targeted unit/worker tests, typecheck, and a packaging verification.
2. Bump version to `2.1.8` only after functional verification.
3. Build the Windows installer and report its local path.
