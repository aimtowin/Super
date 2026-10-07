# Performance First Pass Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce redundant background work without changing import durability, browsing results, notifications or preview state.

**Architecture:** Keep SQLite's single-writer model, schema and file-operation recovery unchanged. Share a serial task-status polling controller, scope thumbnail invalidation to explicitly identified assets, coalesce reconciliation reads, and retrieve import completion summaries in bounded ID batches using the existing summary pipeline.

**Tech Stack:** Electron, React, TypeScript, SQLite, Vitest and Playwright.

---

User approved the previous audit's optimization direction and requested implementation. Reuse the active checkout and preserve unrelated dirty documents. No release, version bump, ECS access, Git commit or push is included.

### Task 1: Serial task status polling

**Files:** Create `src/renderer/serial-poll.ts` and `tests/unit/serial-poll.test.ts`; modify `src/renderer/App.tsx`.

1. Add fake-timer tests covering a slow read, repeated refreshes, panel-frequency changes, rejection and disposal.
2. Run `npx vitest run tests/unit/serial-poll.test.ts` and confirm missing implementation fails.
3. Implement one in-flight read and completion-relative timeouts; panel toggles change its period without creating another polling loop.
4. Replace the two App polling effects with one controller per library, retaining existing status/error handling and 1s/2s periods.
5. Re-run tests and typecheck. Completion event handlers and manual task controls stay unchanged.

### Task 2: Narrow cache invalidation and bounded refreshes

**Files:** Create `src/renderer/asset-change-cache.ts` and `tests/unit/asset-change-cache.test.ts`; modify `src/shared/protocol/responses.ts`, `src/worker/library-service.ts`, `src/renderer/App.tsx`, `tests/unit/protocol.test.ts`.

1. Test identity-preserving no-op invalidation, affected-ID invalidation and full fallback for events without IDs.
2. Add optional asset IDs to change events emitted by import commits, text saves, content replacement and color-space changes; do not remove existing fields or notifications.
3. Use `createCoalescedRefresh` for event-triggered reads: one active reconciliation and at most one dirty trailing pass. Dispose it when changing library/unmounting.
4. Run protocol, cache and coalesced-refresh tests. Keep watcher/NAS full reconciliation, selected metadata refresh and existing preview-preserving loaders.

### Task 3: Bounded import completion summaries

**Files:** Modify `src/worker/library-service.ts`; create `tests/worker/import-result-scope.test.ts`.

1. Test that a normal import does not query every summary in the library and that summaries match the original full-list/filter result.
2. Extract the existing listing pipeline behind a private helper with an optional parameterized asset-ID restriction. Query batches of <=500 IDs and preserve SQLite binary path order when merging them.
3. Reuse the helper for both fully committed and partially durable import completion results. Preserve sequence collapsing, thumbnail/metadata fields, ignore rules, lenient schema reads and committed-error recovery.
4. Test >500 IDs, sequence frames, merged duplicates, partial commits and existing import recovery suites.

### Task 4: Regression and performance verification

**Files:** Modify `tests/worker/collection-switch-performance.test.ts` to test the current 500-entry layout contract and cumulative completeness rather than remove the bound.

1. Assert all paged layout IDs exactly match the complete ordered scope IDs (no duplicates/holes), including deep offsets.
2. Run focused unit/worker suites, 100k-search and reconciliation benchmarks, `npm run typecheck`, and ESLint on changed TypeScript files.
3. Build the current development bundle and run `preview-background-refresh`, task polling integration and asset pagination E2E against isolated user data.
4. Record actual passes, failures, timings and remaining scope. No blanket claim that historical full-suite failures are fixed; no test against live user libraries.

At the first-pass boundary, cache dependency epochs, asynchronous fingerprint changes, page eviction and Worker architecture changes were deferred pending equivalence/performance evidence. The continuation below supersedes that boundary for measured, verified changes.

## Continuation: full optimization acceptance

The user requested continuation until the original optimization objective is complete. The first pass is not the completion gate. Continue in the active checkout without publishing or touching ECS.

1. Diagnose the pagination failures with real request/result and viewport geometry evidence; preserve scroll, deep jump, all-scope selection and preview contracts. Fix missing-file classification only after comparing unavailable paths with confirmed deletion, including metadata recovery.
2. Measure and reduce cache invalidation from irrelevant background job updates while preserving cross-process/NAS sequence synchronization and invalidation for every actual browse/filter/count dependency. Add compatibility and cache-reuse/equivalence tests before implementation.
3. Measure synchronous import/reconciliation fingerprint paths, then remove demonstrated blocking without weakening source identity checks, cancellation, write leases, atomic commits or recovery. Compare hashes and partial failure behavior.
4. Measure retained browse summaries and rendering work; introduce bounded retention only with selection/viewer/scroll and backward/deep-jump tests. Avoid an unmeasured architecture rewrite or arbitrary concurrency increases.
5. Run focused and broader regression suites plus real Electron UI tests and record before/after timings and memory bounds. Conditional proposals (cursor pagination, FTS changes, multiple workers) require measurement; document why unnecessary if current evidence does not justify their risk.

Each implementation is independently verified. No goal-complete claim until applicable correctness and performance gates pass; skipped/platform-unavailable checks and unrelated historical failures must remain explicit.

### ADR: connection-local browse dependency epochs

Status: accepted for this optimization, subject to regression gates. Requirements: counts/order must remain coherent after local writes, rollback, external writers and old/read-only libraries; background job progress alone must not rerun full badge searches.

Decision: TEMP triggers on current browse/filter/count dependency tables maintain a connection-local epoch; pair it with SQLite `data_version` for conservative invalidation on every external commit and `schema_version` for schema changes. Preserve the durable shared change sequence and its notifications. Bypass memoization during open transactions to avoid rollback/epoch-reuse ABA; query-only inspection handles keep the previous conservative sequence fallback. No main-schema migration or data changes are required.

Alternatives: application-only invalidation misses external/direct SQL mutations; durable categorized epochs require migration/compatibility changes and add persistent write coordination. The TEMP approach adds small per-write trigger and per-read pragma costs and conservatively invalidates on external job-only writes. Include artifact/dimension/palette, human/AI tags, revisions, ignore rules, sequence membership and collection definitions; do not assume thumbnails are irrelevant to dimension filters.

## Implementation and verification record

Implemented without a schema/version change:

- A single completion-relative status poll per library; opening/closing the task panel changes its period without adding a second loop. All five RPCs must settle before another period starts. Old-library responses are ignored on disposal.
- Precise thumbnail cache invalidation for import commits, text saves, content replacement and color-space changes. Events without asset IDs keep full invalidation and reconciliation.
- Import/watcher/NAS refreshes share a coalescing controller, with one active read and a trailing dirty pass. A transient read failure does not drop newer queued work or retry indefinitely without new notifications.
- Import completion queries <=500 affected IDs per batch, using the same summary/ignore/sequence/lenient-schema pipeline as public listing. Results retain SQLite UTF-8 binary path order. Fully skipped imports do not hydrate the library.
- Smart-collection navigation invalidates old ordinary-browse requests even when the new draft deliberately performs no query; smart-collection results also have generation guards. This addresses a stale-result race observed during repeated UI verification.
- Collection performance tests now verify cumulative ordered completeness of the existing 500-entry layout chunks. Pagination E2E preparation explicitly skips the unrelated first-run guide; existing scrolling assertions are kept.

### Verification completed

- Typecheck and ESLint on all changed TypeScript files passed. `git diff --check` passed.
- Nine focused unit suites: **129 passed**.
- Six focused Worker suites (import results, collection performance, confirmation, source stability, no-conflict import, revision metadata): **47 passed**.
- Old-schema/read-only compatibility plus import/scheduling retest: **47 passed** (overlapping tests; do not add these counts as unique tests).
- Broader import/Billfish/Eagle/sequences/search/reconciliation run: **96 passed, 1 failed, 1 skipped**. The failure is the pre-existing `import-planning > treats ENOTDIR from asset stat as missing`, also recorded in `follow-up-fixes.md`; its subsequent Windows EPERM cleanup error is not a second successful/failing functional case. No missing/deletion policy was changed to make it pass.
- Current-build UI tests repeated twice: **10 passed** (8 fullscreen/background-refresh scenarios across all, filtered, configured smart collection and draft scopes; 2 task-panel polling tests including reopen). Known-ID and legacy watcher events, AI notifications, selection and regular-preview persistence are covered. The baseline comparison build was removed/restored before this run.

### Measurements and limits

- 100k synthetic rows: first-page median 17.6ms, keyword 35.1ms, one-character 153.7ms, filter/sort 84.9ms. No material regression compared with the earlier audit. These are local warmed Worker timings, not real-disk/NAS or full UI latency.
- 1200-file reconciliation: 697.5ms total, event-loop lag p95 14.4ms and max 22.5ms; all 1200 discovered.
- 20k recursive collection: first page 35.8ms; **one** layout chunk 50.3ms. The full ordered 20k layout is checked across all chunks, not claimed to load in 50ms.
- 20,001-row library, one imported asset: old full-library result pipeline median 69.7ms; scoped summary query through final counters 13.7ms in one sample. The whole import took 273.7ms including filesystem and commit work. Do not report this as a 5x whole-import improvement.
- Real task-panel logs: in each 4.4s window, open-panel `media.list-jobs` completed 4 times and closed-panel 2 times; the same counts after reopening. Unit tests cover slower-than-period reads, partial failures and disposal.

### First-pass limitations / no release gate claim (historical snapshot)

- The existing bottom-scroll pagination E2E still cannot reach `asset-339.txt`. A diagnostic 30s wait also failed. Rebuilding the renderer with HEAD's original `App.tsx` and `coalesced-refresh.ts` reproduced the same failure with the same current Worker/test setup; this is a **frontend comparison**, not a full old-release comparison. Historical full old-release pagination failures are separately documented in `follow-up-fixes.md`. The diagnostic wait relaxation was removed; no scrolling assertion was weakened or skipped.
- One expanded E2E attempt also encountered an unexpected Playwright worker process exit (`3221226505`); it is not classified as a confirmed application fault or ignored as a pass.
- A real NAS/multi-computer fixture and the entire historical suite were not run. No claim of universally regression-free behavior or release readiness.
- No application data, migrations, existing dirty documents, version, release artifacts, ECS configuration or Git history were changed. Only disposable fixture libraries/build outputs were used for verification.

## Continuation implementation (supersedes the historical failures above)

- Pagination: moved the tail sentinel inside the content-sized grid, re-observe it when an in-flight page settles, and keep it while compact-layout hydration is incomplete. The previously failing 340-asset bottom-scroll case now passes with its original assertion timeout. Full pagination coverage includes collection/trash scopes, scaling and grid/masonry modes.
- Reflow: resolve an anchor from the published compact geometry when its real card is virtualized out, allowing restoration to scroll back to that asset before measuring its mounted card. A unit test failed before this fix and now passes. The existing Ctrl-wheel contract anchors the canvas center, not the pointer; E2E now captures that actual center after the ordinary wheel settles and still checks that asset remains in the viewport.
- Availability: preserve revisions/metadata when an ancestor becomes a regular file (Windows ENOENT as well as ENOTDIR), or is temporarily delete-pending (Windows EPERM). Confirmed removals still use the existing cascade policy; restored paths recover the same asset/revision/metadata. Genuine EACCES/EIO errors are not swallowed.
- Browse/sidebar caches: connection-local TEMP triggers track **21** actual dependency tables, including accepted AI analysis state even when no tags/content were generated. Local job progress does not discard counts or the normal browse index. External commits, schema changes, transaction rollback and query-only/old-library inspection retain conservative behavior. No persistent schema change or durable notification removal.
- Background hashing: only changed/dangling existing assets are hashed before bounded reconciliation transactions, using one 1 MiB buffer per file and async reads bounded to its opening size. Check path/descriptor identity, ctime/mtime and size before/after reading, then recheck file identity and current revision immediately before commit. Cancellation and interactive-idle messages run between chunks. Unstable files keep their durable revision for a subsequent scan; unrelated entries still commit. Direct synchronous compatibility APIs and the normal import stream's existing SHA-1/SHA-256/recovery behavior remain unchanged.
- Page merging: allocate ranks only for real retained summaries rather than every layout entry and avoid scope-sized intermediate tuple arrays. Preserve ordering, replacement identity, unknown-ID stability and duplicates' last-rank semantics; no summary eviction or fake cards.

### Continuation measurements

- 20k-asset sidebar refresh: cache reuse median 4.83ms versus forced invalidation 45.66ms on the same fixture. This is sidebar refresh work, not a whole-application speed ratio.
- 20k-layout/600-loaded-summary merge: previous algorithm median 0.921ms, optimized 0.270ms; rank allocation bounded by 600 rather than 20k. All 20k retained summaries serialize to 8,695,571 bytes in the synthetic fixture; serialized size is **not heap usage**.
- Real Electron, 5k small text sources, 30 forward/backward random jumps: GC-measured renderer heap 31,319,356 bytes initially, 30,586,968 after warming, 30,363,652 after repeat traversals; maximum 105 mounted cards. This demonstrates stable repeated-page behavior for this fixture, not a universal memory ceiling or large-image decoder bound.
- 64 MiB changed-file sample: synchronous hash 37–38ms uninterrupted; async reconciliation 68–75ms total, event-loop lag p95/max 9–14ms. Async scheduling improves responsiveness, not total hash throughput. Hash equivalence, timestamp-only copy, NULL backfill, empty replacement, dangling revision repair, linked files, append-during-stream, late source replacement and cancellation are covered.
- 1200-file discovery remains responsive: 719–768ms total, lag p95 17–23ms/max 24–27ms in recent runs.
- Latest 100k warmed Worker medians: first page 19.6ms, keyword 39.0ms, one-character 174.8ms, combined filter/sort 94.8ms. These remain within existing gates; host scheduling and concurrent fixture work vary timings.

### Decisions that preserve existing functions

Do not evict loaded summaries now: measured repeated-page heap is stable, while all-scope selection, context actions and viewer navigation still consume retained summaries. The low-risk allocation reduction provides measurable benefit without altering those contracts. No claim that exhaustive browsing of arbitrarily large libraries has a fixed memory ceiling.

Do not replace offset/substring semantics with cursor/FTS-only queries or add parallel SQLite writers: current 100k first-page/search gates pass, including one-character substring search that cannot safely become FTS-only. Normal import already streams copy and hashes; no measured justification to rewrite its durable staging/recovery or legacy Billfish/Eagle compatibility adapters. More speculative work remains future optimization, not a required implementation hidden behind this completion claim.

SQLite semantics verified against primary documentation: [connection-local data_version](https://www.sqlite.org/pragma.html#pragma_data_version) and [TEMP triggers on main tables](https://www.sqlite.org/lang_createtrigger.html#temp_triggers_on_non_temp_tables). No manual schema_version writes.

### Verification status

- Latest focused reconciliation/cache/watch/import/lenient suites: **152 passed, 1 skipped** (7 files). Earlier 135/104/129 counts overlap; do not add them as unique totals.
- Typecheck, changed-file ESLint and `git diff --check` passed. Current-source production-like development bundle rebuilt successfully; chunk-size warnings remain, not hidden as a failure.
- Final expanded all-unit/selected-Worker run: **3124 passed, 6 skipped, 1 failed** across 413 files. The sole failure is an unchanged video-fixture test: bundled FFmpeg has no `lavfi` input, so the test cannot encode its synthetic testsrc2 clip. Do not call the entire suite green or claim video encoding was verified by this fixture. The new Windows ancestor handling fixed the earlier linked-folder EPERM failure; linked-folder tests pass. Report: `tmp/performance-continuation-final-vitest.json`.
- Final rebuilt-source Electron run: **16 passed** in 4.0 minutes, repeating each of 8 cases twice (pagination 4, fullscreen/background-refresh 8, shared task polling 2, memory stability 2). The first new memory-test attempt was blocked by the intentional import-opened media-job dialog; the test explicitly closes that dialog, preserving the product workflow. Repeated memory tests retained about 30MB GC-measured renderer heap and at most 105 mounted cards. Report: `tmp/performance-continuation-final-e2e.json`.
- No real NAS/multi-host environment, large-image/GPU memory soak or full historical E2E suite was exercised. Local external-connection coherence is tested, not presented as a live NAS benchmark. No publication/package/version bump/ECS/Git push is included; user data and unrelated dirty documents remain untouched.

### Acceptance

The evidence-backed optimization scope is implemented and verified: redundant polling/refresh work, import-result hydration, irrelevant count/index invalidation, pagination/reflow correctness, asynchronous changed-file hashing and merge allocations. The test-first workflow influenced the implementation: preserve externally visible contracts and prefer measured bounded changes over eviction or architecture rewrites. Conditional proposals were evaluated and deliberately not introduced where measurements did not justify their correctness risk. This completes the development optimization objective, **not** a release gate or a claim that every possible performance issue has been eliminated.
