# Updater Auto-Open Implementation Plan

> Execute task-by-task in this checkout using the Code verification workflow. No subagents, commits, release or ECS deployment are authorized.

**Goal:** Show update completion, automatically reopen Super Lib, and close its compact native updater without extra input.

**Architecture:** Keep the shared Inno include used by full and delta installers. A one-shot timer enters the existing original-user launch path; unsuccessful launches expose a manual retry instead of hiding the window. Isolated preview hooks simulate results without touching an installed application.

**Tech Stack:** Inno Pascal Script, Win32 timers, PowerShell native UI harness, Vitest.

---

### Task 1: Regression contracts

- Create `tests/unit/update-native-ui.test.ts`.
- Assert completion schedules auto-launch rather than enabling a mandatory button; launch stops the timer before attempting execution; failure keeps retry and close actions; deinitialization clears timers; both installers include the shared UI.
- Run `npx vitest run tests/unit/update-native-ui.test.ts` and confirm intended failures.

### Task 2: Native behavior and interface

- Modify `assets/inno/silent-update-ui.iss`: guarded one-shot auto-launch, result logging, failure-only retry, timer cleanup, compact 500 × 260 layout with readable progress/status.
- Modify `PRODUCT.md` to replace the superseded manual-launch design principle.
- Keep application integrity checks, update cache, original-user execution, normal interactive installation and installation paths unchanged.
- Rerun the contracts.

### Task 3: Real native preview

- Modify `scripts/release/preview-update-ui.iss` and `scripts/release/verify-update-native-ui.ps1`.
- Add preview-only completion hold and simulated first-launch failure; record attempts in isolated Inno logs.
- Compile via `%LOCALAPPDATA%/SuperTools/inno/tools/ISCC.exe /DAppVersion=2.3.15 scripts/release/preview-update-ui.iss`.
- Verify successful auto-close without input and exactly one launch; failure persists, keyboard/click retry closes; progress blocks Escape/Enter/close; visual snapshots of progress, completion and failure; no preview remains open.

### Task 4: Regression and handoff

- Run `npx vitest run tests/unit/update-native-ui.test.ts tests/unit/app-update-service.test.ts tests/unit/pending-app-update.test.ts tests/unit/update-retention-policy.test.ts`.
- Run `npm run typecheck`, `npm run lint`, `git diff --check`.
- Inspect actual native screenshots. Record evidence and distinguish isolated simulation from testing a real elevated installation. Do not package or publish unless asked.

## Verification result (2026-10-07)

- Completed all four tasks. No version bump, Git commit, package build, release or ECS operation.
- Initial four native-source contracts failed against the old manual-completion logic; after implementation, four related test files pass with 29 tests total.
- Both isolated preview and production-code branch compile with local Inno Setup 7.1.0.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/verify-update-native-ui.ps1`: nine checks pass. Includes no-input auto-close, input/reentrant launch defense, 56% progress, completed screenshot hold, click/keyboard retry, failure dismissal, real original-user execution of an isolated probe, and a real missing-executable failure.
- `tests/fixtures/native-update/Super.cs` is compiled into a fresh GUID directory under `tmp/update-ui-preview`; the executable records its arguments and working directory. Production `ExecAsOriginalUser` launched it exactly once with `--updated`, and the native updater exited without input.
- Corrected preview-window readiness/selection and UTF-8 BOM compatibility with Windows PowerShell 5.1. Capture explicitly selects the owned process. All harness-owned windows exit; it does not close or update the user's real app.
- Inspected `tmp/update-ui-preview/progress.png`, `completed.png`, `launch-failed.png`. The failure action fits fully within the 500 × 260 window; normal progress and completion have no unnecessary buttons. Slight translucency reduced to preserve text clarity.
- `npm run typecheck`, `npm run lint`, and `git diff --check` pass. Lint prints only the existing Babel large-file styling note; Git may emit line-ending warnings.
- Limit: not an end-to-end elevated update of the installed application. No real application files, libraries, download cache or installed release were replaced.
