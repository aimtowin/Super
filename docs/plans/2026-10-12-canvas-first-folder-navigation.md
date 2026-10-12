# Canvas-first folder navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> This checkout does not provide the referenced superpowers skills. Codex will execute the same test-first checkpoints sequentially in the existing user workspace; no delegated agents, remote writes or release are authorized by this request.

**Goal:** Folder switches paint the middle canvas first, distinguish pending reads from genuinely empty scopes, and keep new folder/viewer features without navigation regressions.

**Architecture:** Foreground first-page ownership, direct folder-card ownership and Inspector reads are separate. Defer Inspector work until the current canvas is usable, replace whole-library Inspector lookups with target-scoped indexed reads, and preserve generation/session guards rather than increasing timeouts or caching mutable asset results.

**Tech Stack:** React, TypeScript, Electron Main/Worker IPC, SQLite, Vitest and isolated Playwright Electron fixtures.

---

## Evidence and design decision

- `FolderInspector.tsx` currently invokes `inspectFolder` on mount, independently of foreground readiness. `LibraryService.inspectFolder` calls both `listManagedFolders` and (for linked scopes) `listLinkedFolders`; the latter can traverse multiple source trees for empty directories. It then executes another recursive asset search for covers with an exact total. These synchronous operations share the browse Worker's SQLite owner.
- `executeSearchDefinition` clears `contentLoading` before awaiting its first page. Navigation clears assets and resets pagination, so the debounced query can expose the import empty state while both foreground and Inspector reads are still in flight.
- The separate child-folder effect has no scope-keyed pending state. A parent with no direct assets can therefore show import actions before its child-folder cards arrive, or briefly retain previous-scope cards.
- Clearing already-empty range filters allocates new objects/arrays; under persisted non-default sorting this retriggers the discovery debounce during navigation and can submit the same first page twice.

Chosen: targeted reads and explicit readiness. Rejected: hiding/removing the Inspector (loses features), extending timeouts (does not prioritize the canvas), or adding a broad asset cache (requires mutation, AI, watcher and session invalidation before it is safe). Reuse the existing indeterminate loading animation; no new heavy visual effects, schema migration or filesystem mutation.

## Task 1: Reproduce and measure

**Files:** `tests/worker/local-upgrades.test.ts`, new `tests/unit/folder-navigation-loading.test.ts`, new `tests/e2e/folder-navigation-loading.test.ts`.

1. Add a real SQLite assertion that inspecting one managed/linked target never enumerates all library folder lists; preserve descendant totals, ignored assets, offline facts, Unicode prefixes, covers and direct child counts.
2. Add actual-function/hook tests for first-page pending, directory-card pending, stale responses, failure, same-scope refresh and semantic no-op filter reset.
3. Add a genuine Electron IPC-delivery probe: hold first-page/folder-card responses; observe loading rather than import actions; hold Inspector response and verify the current asset/folder cards are usable independently. Save timestamps and screenshots, first run against the original source.
4. Run each new test before modifying production code and retain the failures. Read timing differences as fixture-specific measurements, not a universal speed multiplier.

## Task 2: Targeted folder inspection

**Files:** `src/worker/library-service.ts`, `tests/worker/local-upgrades.test.ts`.

1. Replace `listManagedFolders` with a primary-key lookup; resolve only the selected linked root/virtual directory, using indexed paths for its direct child count.
2. Keep recursive asset/byte aggregation and four real covers. The cover search defers its unused exact total. Preserve ignored/offline/index semantics and avoid walking unrelated disks.
3. Run Worker regression and the before/after indexed fixture measurement. Check invalid IDs, sibling-prefix boundaries, Unicode paths, child folders and empty targets.

## Task 3: Foreground and folder-card ownership

**Files:** `src/renderer/App.tsx`, `src/renderer/use-browse-pagination.ts`, new `src/renderer/use-folder-browse-entries.ts`, relevant lifecycle tests.

1. Keep direct search loading true until the owned request succeeds or fails; stale completion must not clear a newer loading state.
2. Expose successful first-page readiness from the pagination controller, reset it on navigation, and guard queued publications with the existing owner.
3. Give folder-card reads a semantic scope/session key, explicit pending/error state and cancellation. Do not retain previous-scope rows. Load child cards after first-page success; if assets are already available, show them without waiting for folder cards.
4. Only confirmed zero-asset/zero-directory results may show import actions. Keep deliberate draft-smart-collection empty states, search-no-results and trash semantics.
5. Preserve identities when resetting already-empty range/array controls to prevent redundant debounce reads; do not suppress actual sort/filter changes or watcher refreshes.

## Task 4: Secondary Inspector scheduling

**Files:** `src/renderer/FolderInspector.tsx`, `src/renderer/InspectorPanel.tsx`, `src/renderer/App.tsx`, new hook/UI tests.

1. Pass current canvas readiness to the Inspector; retain its loading status without dispatching heavy reads while the canvas is pending.
2. Run the secondary read after a browser paint opportunity; cancel undispatched work on rapid navigation/unmount. Keep result ownership, errors, offline information and covers.
3. Ensure later completion of the old Inspector cannot overwrite the new folder. Do not make the foreground wait for Inspector completion.

## Task 5: Verification and handoff

1. Run `npm run typecheck`, scoped ESLint and `git diff --check`.
2. Run Worker local upgrades, folder entries and relevant search/cache compatibility; pagination, background hydration/reconciliation, metadata sessions and empty-state units.
3. Run new Electron scenarios plus folder recursion/cards, browsing preferences, sidebar hydration, hierarchy, library reopen/switch, filters and all four fullscreen background-refresh scopes, serial `--workers=1` with isolated userData/libraries.
4. Inspect the captured loading and ready screenshots, record real request counts and foreground-before-Inspector evidence; keep failed/conditional results separate.
5. Update this record with exact results and limitations. Do not bump the app version, install into the user's running app, commit/push, rebuild release artifacts or update ECS without a separate release request.

## Implementation and measured behavior (2026-10-12)

All five implementation steps are complete in the working tree; this is a source-level repair, not a new release. Product version remains 2.3.20.

| Phase | Current ownership and presentation |
| --- | --- |
| Choose a folder | Reset the previous navigation's page readiness, hide old-scope rows and invalidate old debounce callbacks |
| First page pending | Central loading animation; no import/empty-folder CTA; no Inspector dispatch |
| First page succeeds | Paint asset cards immediately when present; publish successful-empty readiness separately from request failure |
| Direct child directories pending | Keep usable assets visible, or show loading for a folders-only scope; do not claim the directory is empty |
| Child entries succeed | Paint folder cards; preserve same-scope background-refresh cards, but never an earlier navigation/session's cards |
| Canvas ready | Allow a paint opportunity, then start target-scoped Inspector statistics/covers; its response is not awaited by the canvas |
| Confirmed empty / failure | Empty CTA requires successful zero assets and zero direct directories; failed reads show an error instead |

Additional confirmed fixes: empty discovery ranges retain object identity when cleared; old 200 ms debounce callbacks carry session and navigation generation guards. The original reproduction issued the same navigation first page twice; the corrected isolated run issues it once. A current direct query replacing navigation also releases `uiState=loading`, without overwriting an active import/create/open operation or a newer owner's state.

The Inspector now looks up one managed folder by primary key or one linked root/scope. It no longer calls the global managed/linked folder enumerators and defers the unused exact cover-search total. Recursive indexed asset/byte totals, sibling-prefix boundaries, Unicode, offline indexed directories and lenient tables remain covered. An empty linked directory absent from indexed asset paths is validated with a single target `statSync`, not a source-tree traversal; currently visible direct directory cards supplement the Inspector's indexed child count.

## Verification evidence and honest boundaries

- Before implementation, `tmp/canvas-first-before-unit.json`: 68 pass / 4 fail; no-op discovery reset: 1 pass / 1 fail. The four failures cover global Inspector enumeration/unused cover counting, direct-loading state and successful-empty readiness. Fixture failures from identical import bytes and an incorrect empty-title locator were corrected before the genuine Electron reproduction.
- `tmp/canvas-first-before-e2e-final/` retains the actual pre-fix screenshots and IPC events: early Inspector requests, fake import CTA during first-page and child-directory waits, and two identical first-page requests. The test delays delivery of genuine authorized SQLite responses; it does not substitute asset results or modify the user's library.
- Full unit/Worker suite during implementation: 4,964 pass / 25 conditional skip / 0 fail (`tmp/canvas-first-full-unit.json`). This precedes the final empty-array stability, empty-directory validation and loading-UI refinements; final targeted verification is recorded below separately rather than representing that earlier full run as the final snapshot.
- Final frozen-source targeted unit/Worker verification: **156 pass / 0 skip / 0 fail**, process exit 0 (`tmp/canvas-first-final-156-retest.json`). Includes target Inspector reads and lenient tables, empty/invalid/Unicode/offline linked scopes, cache invalidation, directory entries, page ownership, same-ID reopen/late Inspector responses, direct-query loading UI, background leases and future gate inventory. The preceding two-worker run completed all 156 assertions but exited abnormally during native teardown (`PostQueuedCompletionStatus`, invalid handle); it is not reported as a clean gate pass. Serial rerun uses the same source and cleanly exits.
- Final `npm run typecheck`, scoped ESLint, `git diff --check` and local documentation audit all exit 0. Documentation audit has zero broken links and all 64 existing guide captures retain matching dimensions/SHA-256. The audit does not claim remote/tracked publication of this uncommitted repair.
- Final production-like Electron bundle, same frozen source, serial 12-file regression: **26 pass / 0 skip / 0 fail** (`tmp/canvas-first-final-26-retest.json`). Covers sidebar hydration, direct/recursive folders, drag/trash hierarchy, preferences/zoom, library close/reopen/restart/switch, search/collections, include/exclude filters, four fullscreen background-refresh scopes, Markdown, readonly ZIP and custom covers. New priority scenario is included in the default future E2E gate inventory.
- Visually inspected `pending-first-page.png`, `pending-child-folders.png` and `canvas-before-inspector.png` in `tmp/canvas-first-final-26-e2e/`: pending states show the existing indeterminate loader; actual asset cards render while the right Inspector is deliberately held. Timestamped order is primary response, direct-directory response, then Inspector request. The same scenario confirms a genuinely empty managed directory still offers import actions.
- Earlier expanded regressions and retests are retained, not erased. One format-popover timing failure did not recur in its isolated retest or either final 26-case run. The old size-anchor scheduler deliberately waits 30 animation frames: the preferences fixture now waits for its existing completion marker before asserting an explicit programmatic scroll-to-top, retaining the zero-offset assertion. The original 2.3.20 bundled application passed this scenario; no production anchor policy was weakened. A final-suite test-worker process exited before running its first case (Windows code 3221226505, duration zero); that case passed independently and the unchanged bundle's entire 26-case rerun passed. These observations are not claimed as repaired product faults.

No universal millisecond/percentage speedup is asserted. This verifies request priority, reduced duplicate work and correctness on isolated fixtures, not a benchmark of the user's 24,279-asset library or every slow/offline source disk. No user database, installed app, release artifact, GitHub or ECS state was modified; GitHub/ECS 2.3.20 still lacks this new source repair. K01 Console remains open and K02's already-delivered history is unchanged.
