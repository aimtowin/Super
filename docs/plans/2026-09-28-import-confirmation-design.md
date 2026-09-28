# Import confirmation reliability implementation plan

**Goal:** Fix duplicate import confirmation, synchronous apply stalls and unbounded history refreshes; verify and publish the next Windows release.

**Architecture:** Keep the existing durable import/rollback logic shared between synchronous callers and an asynchronous checkpoint driver. Desktop confirmation is single-flight in the UI and worker, with bounded recent outcomes. Coalesce renderer history requests to one active request plus one trailing refresh. Never yield inside SQLite transactions. Close waits for active application before closing its database.

**Tech Stack:** Electron, TypeScript, React, SQLite, Vitest, Playwright.

## Evidence and scope

The supplied 17:52 log shows two resolve requests about six seconds apart, first apply taking 70.5 seconds, second returning IMPORT_NOT_FOUND; 11,345 history.status requests timed out. No source-change failure or Worker restart is recorded. Prior preparation fix does not cover apply. User approved repair and packaging/publication. Reuse current checkout and preserve unrelated dirty documents. No ECS migration or account/plugin deployment.

## Steps and verification

1. Add confirmation regression tests in `tests/worker/import-confirmation.test.ts`: concurrent and late duplicate calls, different decisions, expiration, close during apply, event-loop progress and read queries between committed assets. Implement bounded outcome reuse and asynchronous checkpoint driver in `src/worker/library-service.ts`, route desktop auto/explicit apply in `src/worker/index.ts`.
2. Add UI submission guards and busy props to App and both conflict dialogs/ImportConflictDialogShell. Disable confirmation, cancellation and changed decisions during submission, with visible progress. Verify with unit/render tests and packaged app where supported.
3. Add a tested coalescing refresh helper, connect both asset/library change notifications, and discard stale library responses. Verify a burst of >11,000 signals produces bounded calls and a trailing refresh.
4. Run focused import lifecycle, rollback, stability, conflict, renderer and worker tests; typecheck and lint modified files. Preserve existing transaction/crash semantics; document any remaining unverified paths.
5. Bump next version only after checking release state; build and test packaged application, produce installer/full/delta manifests, publish GitHub draft then verify before promotion, update explicitly authorized old ECS update source after checking target/space. Record hashes and public manifest/download checks. Commit only this task's files.

## Alternatives considered

- UI-only disabling leaves retries/IPC duplicates unsafe.
- Raising timeouts leaves event-loop stalls and >11,000 requests queued.
- Selected: front/back protection plus bounded queries and cooperative apply; retain synchronous compatibility and rollback boundaries.

## Execution

User already approved implementation and release; execute in this chat without delegation. The referenced superpowers implementation/worktree skills are unavailable; use normal local patch/test workflow in the existing suitable checkout.
