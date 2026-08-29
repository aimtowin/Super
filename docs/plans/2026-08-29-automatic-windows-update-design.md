# Automatic Windows Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically check, download, and verify a newer Windows release, then install it only after the user explicitly chooses to restart Super Lib.

**Architecture:** Keep GitHub Releases and the existing SHA-256 verification contract. Split the update service into prepare and launch phases: startup prepares a verified installer in a temporary directory and the renderer displays a persistent lower-left restart prompt. Only that explicit action launches Inno Setup; ordinary shutdown discards the staged installer. Inno Setup uses the existing stable AppId to update the original installation directory.

**Tech Stack:** Electron 43, TypeScript, Vitest, Inno Setup, GitHub Releases.

---

### Task 1: Stage verified installer updates

**Files:**
- Modify: `src/main/app-update-service.ts`
- Modify: `src/shared/app-update.ts`
- Test: `tests/unit/app-update-service.test.ts`

**Step 1:** Add tests proving a Windows installer can be downloaded, checksum-verified, extracted into the temporary staging directory, and retained until explicitly launched.

**Step 2:** Split `downloadAndInstall` into reusable prepare and launch operations. Preserve the existing manual operation as prepare followed by launch; do not expose filesystem paths through IPC.

**Step 3:** Add cleanup tests for discarded and launched staged installers.

### Task 2: Coordinate automatic startup and shutdown

**Files:**
- Modify: `src/main/index.ts`
- Test: `tests/unit/app-update-service.test.ts`

**Step 1:** Schedule one update check after the initial window is created; only automatically stage supported installed Windows releases.

**Step 2:** Notify the renderer when an update is ready; on ordinary shutdown discard a staged installer without launching it.

**Step 3:** Add a persistent lower-left "restart to update" action that launches the staged installer and then exits the app.

### Task 3: Make the installer restart Super Lib after a silent update

**Files:**
- Modify: `assets/inno/supersetup.iss`

**Step 1:** Add a silent-only Inno `[Run]` entry.

**Step 2:** Start `{app}\Super.exe` after a silent installation without changing ordinary interactive installation behavior.

**Step 3:** Keep ordinary interactive installation behavior unchanged.

### Task 4: Produce the release asset contract

**Files:**
- Modify: `scripts/inno-build.mjs`
- Test: `tests/unit/app-update-service.test.ts`

**Step 1:** After Windows Inno compilation, produce `Super-win-x86-64-<version>-setup.zip` containing only `SuperSetup.exe`.

**Step 2:** Generate its adjacent SHA-256 file so it matches the asset name expected by the update client.

**Step 3:** Run targeted update tests, type checking, and a release artifact smoke check.
