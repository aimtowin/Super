# Repository cleanup and illustrated feature guide — Implementation Plan

> **For Codex:** Execute the explicitly requested cleanup, documentation review, isolated screenshot capture and GitHub synchronization in bounded batches. The unavailable `superpowers:*` workflow is replaced by this repository's Git, Node and Electron/Playwright tooling; no delegation is requested.

**Goal:** Make current user/developer documentation accurate for Super Lib 2.3.17, publish an illustrated feature catalogue prominently from the repository homepage, and remove obsolete unreferenced repository assets without losing product inputs or historical evidence.

**Architecture:** Preserve renderer → preload → main → Library Worker boundaries and the released runtime. Keep vendored media, licenses, database migration history and release baselines. Separate current instructions from dated plans/validation records; use an isolated profile and disposable library for screenshots.

**Tech Stack:** Markdown, Git/GitHub CLI, Node.js 24, Electron 43, Playwright, repository test fixtures.

---

## Scope and safeguards

- The user authorizes repository cleanup, documentation edits, application screenshots and GitHub synchronization. This is not a new binary release or ECS deployment.
- Preserve pre-existing edits to `docs/README.md` and `docs/releases/v2.3.0-validation.md`; integrate only relevant reviewed text. Preserve local handoff and conversation exports without publishing private paths or credentials.
- Do not change database schema, runtime behavior, package/dependency versions, repository visibility, historical tags or release attachments.
- Do not call a real AI provider, configure a remote WebDAV account, create an MCP credential or use a real asset library for screenshots.

## Task 1: Inventory and evidence

**Files:** `README.md`, `README.en.md`, `docs/README.md`, `docs/REPOSITORY_GUIDE.md`, all tracked Markdown documents, architecture snapshots, existing UI assets.

1. Record Git status, tracked files, package version and remote main/release metadata.
2. Identify current-document version/behavior drift, broken local links, exposed deployment paths and unreferenced images.
3. Write the audit findings to `docs/reference/documentation-review-2.3.17.md`; retain dated validation outcomes rather than silently updating their historical claims.

**Verify:** `git fetch origin`; `git rev-list --left-right --count HEAD...origin/main`; local documentation audit reports exact file/line findings.

## Task 2: Capture current features

**Create:** `scripts/docs/capture-features.mjs`, `docs/assets/ui/live-2.3.17/manifest.json`, screenshots and `docs/user-guide/features.md`.

1. Start the actual 2.3.17 executable using a separate user-data directory and a disposable fixture library.
2. Exercise real UI/typed preload operations with owned fixtures; screenshot each documented surface after it is ready.
3. Include navigation/library, managed and linked imports, organization, all filter dimensions, media viewers, settings/appearance, AI entry points, plugins, scripts, MCP, synchronization, tasks, diagnostics and update controls.
4. Mark settings-only screenshots and features needing external services honestly. Record executable/version, source fixture ownership and screenshot dimensions/hash.
5. Close only task-owned processes. Review every captured image, using overview contact sheets plus full-size inspection of dense views.

**Verify:** Capture script exit 0; all listed images exist, decode and match the manifest. Every catalogue feature links to an actual screenshot, usage instructions and its limits.

## Task 3: Correct current instructions

**Modify:** Chinese/English README and user guides, `docs/README.md`, `docs/REPOSITORY_GUIDE.md`, `docs/PROJECT_DECISION_AND_RELEASE_HISTORY.md`, `docs/reference/automatic-update-porting-guide.md`, applicable extension/API references.

1. Add the illustrated guide near the top of both repository homepages.
2. Correct 2.3.17 scope, resource-library card/index, emoji, single-location hints, include/exclude/inversion and automatic reopening after a successful update.
3. Verify supported formats and automation/plugin/MCP APIs against source; remove unsupported availability promises.
4. Mark historical plans and reviews as snapshots; cross-link the current guide and latest validation.

**Verify:** All tracked Markdown local links and image targets resolve; current-document checks pass; no credentials or local administration paths are newly published.

## Task 4: Recoverable cleanup and synchronization

**Modify:** Only proven-unreferenced stale UI assets and accidental local export tracking/ignore rules.

1. Generate an explicit cleanup candidate list; exclude runtime resources, source/tests, baseline manifests, architecture/validation evidence and user data.
2. Move selected stale images to a task-specific local backup outside the repository; record relative source names in the audit.
3. Run `git diff --check`, documentation tests/audit and the actual screenshot flow; review staged changes explicitly rather than `git add .`.
4. Commit the scoped documentation/cleanup changes, push without force and re-read GitHub main/README/image paths to verify synchronization.

**Verify:** Remote main equals the scoped local commit; current screenshot/guide links resolve remotely; pre-existing unrelated local files remain intact. No new application release or ECS mutation.

## Progress

- [x] Repository/version/remote baseline confirmed; GitHub repository remains private.
- [x] Documentation audit: 138 Markdown documents; local links and screenshot integrity checked, with explicit historical boundaries.
- [x] Isolated actual-app capture: 62 desktop/floating images plus 2 native safe-preview states. A real packaged Console dependency failure is documented, not marked functional PASS.
- [x] Current Chinese/English instructions, API examples, update behavior and historical boundaries corrected.
- [x] Recoverable cleanup: 34 old images moved to an external desktop backup, with hash comparisons; scoped commit/push uses the verified files only.

## Outcome and verification

See [the audit report](../reference/documentation-review-2.3.17.md) and [feature guide](../user-guide/features.md). Current software remains 2.3.17; no application runtime, database schema, release attachments or ECS state was changed. Private handoff and conversation exports remain local.

Executed: real fresh-library capture, supplemental hover-panel recapture, native preview, image integrity/coverage audit, 5 documentation tests, ESLint for new scripts, media verification and whitespace check. Git index and remote main checks complete the publication workflow; repository visibility remains private.
