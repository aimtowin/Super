# Import source stability implementation plan

**Goal:** Fix stale import snapshots and keep Worker polling responsive during managed desktop imports without weakening copy integrity or automation confirmation fences.

**Architecture:** Share the existing preparation transaction through a step generator, driven synchronously by legacy/bulk callers and asynchronously by desktop imports. Refresh ordinary content metadata immediately before copying while preserving enumerated device/inode identity; validate the opened handle against the path and validate again after copying. Retry only SOURCE_CHANGED, at most three attempts, and report local diagnostic context. Preserve atomic batch failure and cleanup on persistent instability. Automation keeps its strict preflight snapshot and validates staged hashes against approved source tokens.

**Tech stack:** TypeScript, Node filesystem APIs, SQLite, Electron Worker, Vitest.

## Steps

1. Add regression cases in `tests/worker/import-planning.test.ts` for a file updated after enumeration, asynchronous staging responsiveness, transient/persistent changes, symlink replacement, and library closure.
2. Refactor `src/worker/library-service.ts` preparation into shared steps. Yield between enumeration/planning items; async copy and hash in bounded chunks. Keep synchronous entry points compatible.
3. Route `asset.import.prepare` in `src/worker/index.ts` to asynchronous preparation. Track in-flight preparations for library close and preserve writer ownership with heartbeat.
4. Run import-planning, automation import, worker-routing and relevant lifecycle regressions, TypeScript and lint. Inspect the diff for transaction cleanup, hash correctness and unchanged unrelated files.

## Scope decisions

- No disabling integrity checks and no merely increasing polling deadlines.
- No silent partial import; persistent failures continue to roll back the batch and now identify the source in local diagnostics.
- No version bump, packaging, release, ECS operation, or unrelated edits.
- Reuse the existing workspace; preserve pre-existing documentation changes. Execute directly in this chat, without sub-agents.

## New evidence: Billfish directory and bracketed names

- User subsequently identified the source as an old Billfish library root; importing other subsets reaches the content-duplicate dialog.
- Real-filesystem regression tests import Chinese names and `[OPPO]`, `[华为]`, `[临时文件]`, `[其他]`, `[课程]` without renaming. These visible characters do not explain the logged `SOURCE_CHANGED` stack.
- Ordinary folder import includes `.bf`; the dedicated Billfish reader excludes `.bf`, `.recycle`, `.recycle2`, and `.trash`. A continuously changing synthetic `.bf/library.db` reproduces `SOURCE_CHANGED` and now records the exact file and phase. This is a plausible explanation, not proof of the user's actual failing file: the original log omitted the source path.
- No blanket filtering or deletion of database files was added to ordinary import. The user can close Billfish and use its dedicated importer; a new log can identify any remaining unstable source.

## Implementation and verification (2026-09-28)

- Ordinary managed import now uses asynchronous, bounded-size copying and computes SHA-256/SHA-1 during the copy. Enumeration and preparation loops yield to the event loop. Remaining synchronous SQLite/commit work and linked-folder-specific import are not claimed to be fully asynchronous.
- Source changes retry up to three times, with 50 ms asynchronous retry backoff. Different file identities and symbolic links remain rejected. Continuously growing files cannot extend a copy attempt indefinitely.
- Per-library write lease plus heartbeat protects asynchronous preparation; read requests remain available. Library close waits for preparation cancellation/handle closure/cleanup. Previously staged items survive an individual retry, but persistent failure still rolls back the batch.
- `import.source-copy` diagnostics include source path, phase, changed metadata fields, attempt and retry decision on the desktop asynchronous path. No raw file contents or credentials are logged.
- Final eight-file regression run: **90 passed, 1 platform skip** (`import-source-stability`, `pending-import-lifecycle`, `import-no-conflict`, `eagle-import`, `billfish-import`, `automation-write-fencing`, `library-service`, `worker-client`). Includes **20 new stability tests**.
- Final `import-planning.test.ts -t 'pending import plans'`: **40 passed**; 12 other tests filtered/skipped. Combined final focused runs: **130 passed**.
- Earlier unfiltered nine-file run: 138 passed, 2 skipped, 1 failed (`treats ENOTDIR from asset stat as missing`), plus its Windows cleanup error. This exact failure is already recorded in `follow-up-fixes.md`; no assertion or unrelated asset-refresh behavior was changed to conceal it.
- Full project TypeScript checks and targeted ESLint passed. `git diff --check` passed.
- No package/version change, deployment, release, ECS action, or real user-data mutation. Reproduction against the user's original Billfish tree remains unverified until they run a newly packaged build.
