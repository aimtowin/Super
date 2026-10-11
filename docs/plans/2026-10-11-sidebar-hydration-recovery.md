# Sidebar Hydration Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore prompt, reliable sidebar loading without changing assets, search, library isolation or background refresh coalescing.

**Architecture:** Publish each successful count/list independently while retaining the physical lease until every dispatched read settles. Library counts and organization have separate refresh generations from the canvas query, still protected by the captured library session. A newer sidebar/count refresh supersedes the old category; merely changing search or sort does not.

**Tech Stack:** TypeScript, React, Vitest/happy-dom, Electron/Playwright.

---

## Evidence and scope

- Reported installed version: 2.3.19. Canvas has assets while sidebar and Inspector are empty.
- Read-only database inspection confirms folders and collections exist; this is not an empty library. No production database/service is opened for tests.
- Existing `hydrateContent` waits for all requests and discards all results on one transport rejection. App additionally ties every result to the foreground browse generation. Restored non-default sorting starts another search after 200 ms, invalidating the first pending hydration.
- Alternatives: simply extending timeouts would not resolve logical cancellation; removing all stale-result guards would risk cross-library contamination. Keep guards but separate their ownership.
- Preserve existing pending release documents, frozen 2.3.19 artifacts/baseline and MIT notices. GitHub 2.3.19 remains draft while investigating; ECS already serves 2.3.19. No database migration, user-data modification or server rollback.
- Referenced worktree/execution sub-skills are unavailable; implement sequentially in the existing authorized checkout, without agents or resetting unrelated changes.

## Task 1: Reproduce against current implementation

**Files:** Modify `tests/unit/background-hydration-lifecycle.test.ts`.

1. Release `listFolders` while holding `root-count`; assert folders publish immediately and the lease stays pending.
2. Reject a count request and resolve a collection request; assert that collection still publishes.
3. Execute the actual extracted App `loadContent`, increment foreground generation as a restored discovery search does, resolve sidebar reads; assert folders/counts remain publishable in the same library.
4. Run `npx vitest run tests/unit/background-hydration-lifecycle.test.ts --maxWorkers=1`; record the new assertions failing against the original implementation.

## Task 2: Correct publication ownership and counts

**Files:** Modify `src/renderer/content-hydration.ts`, `src/renderer/App.tsx`, `tests/unit/background-hydration-lifecycle.test.ts`, `tests/unit/background-reconciliation-wiring.test.ts`.

1. Replace the aggregate-only update with per-field fulfillment handlers. Each handler checks ownership; transport/typed failures affect only their own field. Await `Promise.allSettled` on all handlers to preserve the raw lease.
2. Introduce sidebar/count refresh generation refs in App. Increment them before the primary request only when the category will refresh. Guard state updater execution as well as callback entry with the captured session and corresponding category generation.
3. Pass whether the primary total is an unfiltered exact scope total. Otherwise fetch the missing all/root counter; never treat a filtered page total as a library total.
4. Update old aggregate-policy assertions to the intended progressive policy. Add superseding-refresh, same-library reopen, navigation-only, preference-change and filtered-count cases. Keep the 100-event no-overlap test.
5. Run both modified test files plus hydration/session/visibility/restore tests, then `npm run typecheck` and lint modified TypeScript files. Expect no failed assertions or diagnostics.

## Task 3: Real-window regression and handoff

**Files:** Create `tests/e2e/sidebar-hydration.test.ts`; update this plan with measured results and the current known-issues document with the release boundary.

1. Use an isolated temporary library/profile and real Electron/Worker. Create folders/collections, restart with non-default persisted sorting; assert sidebar rows and Inspector counts return alongside canvas cards.
2. Run via `node scripts/run-e2e-isolated.mjs tests/e2e/sidebar-hydration.test.ts tests/e2e/library-recent.test.ts --workers=1`. Any startup timing controls must wrap real preload responses, not replace production hydration logic.
3. Include search, root navigation and background refresh/fullscreen regression coverage. Record actual pass/fail/skip results; do not claim a measured performance improvement from mock timing alone.
4. Review `git diff --check` and the scoped diff. Report source fix versus installed/released version separately; new release artifacts must never overwrite the frozen 2.3.19 package.

## Actual results (2026-10-11)

- Before production edits, three new unit assertions failed against the original helper and actual extracted App loadContent. Existing 24 assertions passed. The failures were ready folders withheld by another count, ready collections withheld after a transport failure, and sidebar results discarded after foreground generation changed.
- The real frozen Windows 2.3.19 executable also failed the new isolated Electron test at the collection-row assertion after its real persisted sort issued a second foreground query. This used the genuine Main/Worker responses with controlled delivery gates, not a replacement hydration implementation. Trace: `tmp/sidebar-regression-old-2.3.19/`.
- Implemented progressive field publication; separate count/sidebar generations; initial hydration completion even when the primary page is superseded; correct global versus filtered totals; navigation requests posted before supplementary counts. Physical background lease still drains all dispatched reads.
- Final targeted suite: **164 passed, 0 failed**, 11 files; includes current App boundaries, queued React updater ownership, same-ID library reopen, newer full refresh, ignored-item preferences, count-only navigation, pagination, notification policy and 100-event coalescing. Raw JSON: `tmp/sidebar-regression-unit.json`.
- Final source-build Electron run: **8 passed, 0 failed, 0 skipped**, single worker, about 1.3 minutes. Covers the new restored-sort/held-count/filtered-count test, both recent-library tests, four fullscreen background-refresh scopes and the existing viewer/library upgrade scenario. Outputs: `tmp/sidebar-regression-final/`. An earlier corrected-source run of the same 8 cases also passed; the final run additionally includes the changed Worker queue submission order.
- Application/extension typecheck and scoped ESLint passed; final whitespace/diff check passed. No full-suite, real-provider, NAS or real-user-library upgrade claim is made from these targeted results.
- Screenshot `sidebar-before-slow-count.png` in the final test output captures successful side lists while the root-count response is still held. It is an isolated fixture, not the user's production library.
- Source fix is **not in the installed 2.3.19 package**. Frozen artifacts and baseline remain unchanged. GitHub 2.3.19 stays draft; the existing ECS source already serves the original 2.3.19. Repackaging must use a new version and fresh provenance rather than replace these bytes.

## Delivery follow-up: 2.3.20

On 2026-10-11, the user explicitly requested repackaging and publication. A fresh Windows 2.3.20 package from frozen commit `f4664285af04eb2ab3efdc1f575d8770725d173d` passed all 9 packaged scenarios, including this regression. Contract gates passed; the full development suite ran 106 cases (94 passed, 12 conditional skips, no failures or flaky cases); 9 isolated native-updater scenarios passed. The old 2.3.19 artifacts and baseline were not replaced.

GitHub 2.3.20 became the public latest release at 20:12:06 Asia/Shanghai; the existing ECS updater now serves 2.3.20. All 46 GitHub assets and all 25 server staging files were hash-checked. Public full-update and 2.3.19 delta downloads matched their exact lengths and SHA-256 values. See the [release acceptance](../releases/v2.3.20-validation.md). This delivery follow-up supersedes the earlier pending-delivery state; it does not change the original reproduction or targeted-test evidence, and K01 remains open.
