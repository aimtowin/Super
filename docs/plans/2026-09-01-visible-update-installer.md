# Visible Update Installer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the unreliable silent-update auto-relaunch handoff with a branded foreground updater that reports real Inno Setup progress and waits for an explicit user click before opening Super Lib.

**Architecture:** Super continues to download and verify the archive before the user approves installation. When its detached silent Inno process begins, the Inno script detects silent mode and creates its own independent dark translucent update form. `CurInstallProgressChanged` drives the progress bar from real installer extraction work; at `ssPostInstall`, the form becomes a completion screen and only its launch button starts `Super.exe`. This stays alive after Super exits and works for both full and delta installers.

**Tech Stack:** Electron update service, Inno Setup Pascal Script, Windows desktop controls, Vitest update-service regression tests.

---

### Task 1: Create the shared silent-update presentation in the full installer

**Files:**
- Modify: `assets/inno/supersetup.iss`

1. Define a custom, fixed-size dark update form only when `WizardSilent` is true.
2. Add title, status text, native progress control, version-safe completion state, and an enabled-on-complete `启动 Super Lib` button.
3. Feed the progress control from `CurInstallProgressChanged`; use an indeterminate/marquee state before a usable maximum is reported.
4. Replace the silent `[Run]` auto-launch entry with the form's explicit launch action, while retaining normal interactive installer behavior.
5. Compile the Inno script to validate Pascal syntax and installer sections.

### Task 2: Generate the same behavior for delta installers

**Files:**
- Modify: `scripts/release/build-inno-delta.mjs`

1. Extract the same Pascal-script presentation into the generated delta installer source.
2. Keep delta file application and stale-file deletion unchanged; only change the silent presentation and launch handoff.
3. Generate a controlled delta from the 2.1.0 baseline and verify the resulting script and archive contain the new updater behavior.

### Task 3: Preserve updater semantics and verify

**Files:**
- Test: `tests/unit/app-update-service.test.ts`
- Test: generated Inno installer scripts

1. Keep the downloader, checksum verification, resume logic, and full-package fallback untouched.
2. Run TypeScript type checking and targeted update-service tests.
3. Build both installers with Inno Setup and inspect the generated delta script for installer progress and explicit launch hooks.
