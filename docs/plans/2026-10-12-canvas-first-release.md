# Canvas-first 2.3.21 Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> The referenced superpowers package is unavailable. Execute these checkpoints sequentially in the existing workspace, preserve the already-verified repair, and do not delegate or switch worktrees merely to publish it.

**Goal:** Deliver the verified canvas-first folder repair as a new immutable Windows x64 release to GitHub and the previously used ECS update volume.

**Architecture:** Freeze a new version/source commit; one provenance-bound packaged tree generates installer, full update, retained direct deltas and checksums. Stage and verify remote bytes before publishing latest metadata; keep original versions and rollback facts.

**Tech Stack:** Electron Forge/Vite, Inno Setup, Playwright, GitHub CLI, SSH/SCP, SHA-256.

---

## Task 1: Freeze source and preserve 2.3.20

- Modify `package.json`, root entries in `package-lock.json`, `README.md`; add `docs/releases/v2.3.21.md` and `docs/releases/v2.3.21-validation.md`.
- Include only the known canvas-first repair/test/doc changes from the preceding turn. Keep Console K01 open and the MIT/source notice intact.
- Verify `git diff --check`, documentation links, current remote main/tag/release identity. Normal commit; no force push, tag replacement or user-library writes.
- Verify the original installer/full-update SHA-256 against 2.3.20 receipts; move owned `out/Super-win32-x64` and `out/make` into a new `out/archive/2.3.20/` after validating exact absolute paths. Do not overwrite an existing archive or baseline.

## Task 2: Release gates

- Run `npm run release:verify` with `SUPER_GATE_INTERACTIVE_DESKTOP=1` only after checking Explorer and the current process share an interactive session.
- Record six contract gates, the full explicit development E2E inventory and nine native-updater fixture scenarios. GUI tests are serial, with isolated userData/libraries; failed, conditional and blocked results are separate.
- Use the existing locked media bundle; no dependency upgrade or media provenance bypass.

## Task 3: Build and test the actual packaged app

- Run `npm run release:package` and inspect version/build provenance. Run `npm run release:e2e`.
- Execute canvas-first, sidebar hydration, viewer upgrades and four preview-background-refresh scopes against the actual `out/Super-win32-x64/Super.exe`, not a rebuilt development bundle.
- Product failures block publication; preserve evidence and repair within this authorized scope before rebuilding. Do not install the package into the user's running directory.

## Task 4: Derive installation/update artifacts

- `npm run make -- --skip-package`; `npm run make:inno`; `npm run release:deltas`; `npm run release:baseline`; `npm run release:checksums`.
- All derivatives must verify the same package build ID/fingerprints. Preserve twenty newest eligible prior baseline sources and the size-ratio gate.
- Dry-run `publish-ecs-update.mjs` with bounded release notes; verify canonical artifact inventory, sizes and SHA-256. No existing target/version overwrite.

## Task 5: Publish and independently verify

- Push the frozen source and a new annotated `v2.3.21` tag normally. Create a GitHub draft, upload only canonical artifacts/checksums/index, and compare API names/sizes/digests with local files.
- Recheck the previously used ECS identity, canonical update path, old latest metadata, free space and retained release directories through read-only SSH. If target identity differs, stop for direction.
- Preserve the previous latest manifest; stage twenty-five update files, verify every uploaded SHA-256, then atomically promote. Apply only the existing five-release retention policy after confirming older bytes are recoverable; no other website/data cleanup.
- Fetch public latest JSON and fully download the new full package and 2.3.20 delta to fresh local verification outputs. Check body lengths and SHA-256, not only HEAD.
- Only then make GitHub latest/non-draft and append verified receipts, source/build/artifact identities and delivery time. Update K03 to delivered within tested boundaries; K01 remains open.

## Handoff

Report the published version, direct GitHub installer and absolute local installer path. Distinguish current delivery facts from source-test results, platform skips and known Console failure; do not promise a universal loading-speed percentage.
