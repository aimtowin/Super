# Tray watcher recovery implementation plan

**Goal:** Prevent coalesced filesystem events from blocking browsing after tray restore.

**Architecture:** Reuse cancellable asynchronous reconciliation with scoped discovery. Serialize watcher batches per library, retain changes across pause/resume, and honor the existing interactive-idle deadline before scanning or committing. Do not change installed libraries, timeout budgets, update delivery, or version numbers.

**Tech Stack:** Electron utility process, TypeScript, SQLite, Vitest.

## Implementation and verification

1. Add regressions in `tests/worker/library-watcher.test.ts`: restore while interactive, scoped linked scans, repeated pause/resume, and events arriving during a scan. Confirm the synchronous implementation fails the interactive-priority assertion.
2. Update `src/worker/library-service.ts`: watcher callbacks enqueue scope only; a per-library async drain shares reconciliation cancellation and yields. Scoped discovery must not mark unscanned roots missing. Update synchronous watcher tests to await completion.
3. Add always-on slow request/timeout attribution in `src/main/worker-client.ts` and bounded slow command timing in `src/worker/index.ts`. Record command names, request ids and durations, never file contents or credentials.
4. Run focused worker/unit regressions, type checks and targeted lint. Use disposable libraries for responsiveness checks. Distinguish simulated standby from real multi-hour soak coverage.

User approved implementation after the diagnosis. Preserve the dirty tree; no automatic Git commit, release or restart of the installed app.

## Verification results

- Old implementation failed the new accumulated-tray-events test by entering synchronous refresh during the foreground idle guard. The changed implementation passes it.
- 56 worker tests passed: watcher, reconciliation performance, linked folders/indexing, library availability.
- 33 unit tests passed: worker request handling, one-shot open-reconciliation gate, browse pagination.
- Real Electron test passed using a disposable profile/library: 100 initial files, 800 files added while hidden, eight root/source navigation cycles, eventual 900 indexed files, no WorkerRequestTimeoutError. Read round trips: 47, 52, 60, 54, 50, 44, 52, 128 ms.
- Actual screenshots: `test-results/tray-watcher-recovery-tray-34ab9-file-changes-are-reconciled/tray-restored.png`.
- Broader lifecycle suite: two v1 migration fixture tests failed in `downgradeLibraryToV1` with `no such table: main.jobs`, followed by fixture cleanup errors. That fixture/migration code was not changed; this is not a full-suite green claim.
- No long-duration real standby soak, production installation, version bump or ECS release was performed. The installed v2.2.2 remains unchanged.
