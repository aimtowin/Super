# AI Smart Collections and Analysis Status Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-assisted temporary smart collections, explicit AI analysis status filtering, linked-folder auto-analysis, and safe single-asset reanalysis without replacing data before user confirmation.

**Architecture:** Keep AI search local-first: the configured remote provider translates natural language only into a validated search plan; the Worker applies that plan to local analyzed-asset indexes. Add durable analysis state and pending reanalysis proposals in the library database. Existing manual smart collections remain available and their execution is constrained to analyzed assets.

**Tech Stack:** Electron, React, TypeScript, Zod, SQLite/better-sqlite3, Vitest, existing Main/Worker IPC and AI queue.

---

### Task 1: Durable analysis state and reanalysis proposals

**Files:**
- Modify: `src/worker/library-service.ts`
- Modify: `src/shared/asset-types.ts`
- Test: `tests/worker/ai-analysis.test.ts`

**Step 1:** Add failing worker tests for `unanalyzed` / `analyzed` state, legacy AI-content backfill, and a staged reanalysis that does not alter the accepted result.

**Step 2:** Add a forward-only schema migration for asset analysis state and pending proposals. Backfill old accepted AI descriptions, ratings, and AI tags as analyzed.

**Step 3:** Make first analyses commit accepted data and mark analyzed; make reanalysis writes create one proposal per asset/revision instead of replacing accepted data.

**Step 4:** Add accept/discard proposal operations that atomically update AI fields/tags and refresh the local search index only on accept.

**Step 5:** Run `npm run test:worker -- tests/worker/ai-analysis.test.ts`.

### Task 2: AI status filter and analyzed-only smart execution

**Files:**
- Modify: `src/shared/asset-types.ts`
- Modify: `src/worker/library-service.ts`
- Modify: `src/renderer/DimensionFilterBar.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/active-discovery-filters.ts`
- Test: `tests/worker/library-service.test.ts`
- Test: `tests/unit/active-discovery-filters.test.ts`

**Step 1:** Extend structured filters with an `ai_analysis` categorical field accepting only `analyzed` and `unanalyzed`.

**Step 2:** Compile that field into parameterized Worker SQL using durable analysis state, including exclusion semantics.

**Step 3:** Force the analyzed condition whenever a smart collection executes, without changing manual collection definitions.

**Step 4:** Add the top-level AI analysis status control and active-filter chip.

**Step 5:** Run focused worker and renderer unit tests.

### Task 3: Queue semantics for folder and linked-folder analysis

**Files:**
- Modify: `src/shared/protocol/requests.ts`
- Modify: `src/shared/protocol/responses.ts`
- Modify: `src/shared/library-api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/worker/library-service.ts`
- Test: `tests/worker/ai-completion.test.ts`

**Step 1:** Add a folder-scoped unanalysed-only enqueue operation that understands managed folders, linked roots, and linked virtual subdirectories.

**Step 2:** Return durable per-batch totals with completed, failed, and skipped asset details.

**Step 3:** Route linked-folder watcher additions through the same non-blocking auto-analysis enqueue path as managed imports; preserve existing external-library suppression.

**Step 4:** Ensure an existing accepted result is skipped by folder batches, while a direct single-asset reanalysis intentionally creates a proposal.

**Step 5:** Run worker queue and linked-folder tests.

### Task 4: Inspector reanalysis review

**Files:**
- Modify: `src/renderer/inspector-ai-analysis.ts`
- Modify: `src/renderer/InspectorPanel.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/AiReanalysisReviewDialog.tsx`
- Test: `tests/unit/inspector-ai-analysis.test.ts`

**Step 1:** Change the inspector action to `AI` for unanalysed assets and `重新分析` for accepted assets.

**Step 2:** Add a review dialog that compares accepted and proposed description, tags, and rating for one asset.

**Step 3:** Wire accept/discard IPC actions and refresh only after a confirmed acceptance.

**Step 4:** Run focused UI tests and typecheck.

### Task 5: Folder one-click analysis and outcome review

**Files:**
- Modify: `src/renderer/NavigationSidebar.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/AiFolderAnalysisReviewDialog.tsx`
- Modify: `src/renderer/i18n/catalogs/zh-CN.ts`
- Modify: `src/renderer/i18n/catalogs/en.ts`

**Step 1:** Add a hover-visible AI action beside every managed/linked sidebar folder, with an explicit recursive scope.

**Step 2:** Reuse the existing queue progress banner for `done/total`, pause/cancel, and background execution.

**Step 3:** Show a completion review with success, failure, and skipped resource lists; skipped accepted assets are listed but not modified.

**Step 4:** Run typecheck and relevant E2E coverage.

### Task 6: AI smart-collection conversation

**Files:**
- Modify: `src/main/ai-search-planner.ts`
- Modify: `src/shared/asset-types.ts`
- Modify: `src/shared/library-api.ts`
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/AiSmartCollectionDialog.tsx`
- Modify: `src/renderer/NavigationSidebar.tsx`
- Modify: `src/renderer/i18n/catalogs/zh-CN.ts`
- Modify: `src/renderer/i18n/catalogs/en.ts`
- Test: `tests/unit/ai-search-planner.test.ts`

**Step 1:** Keep the existing provider schema strictly read-only and inject the analyzed-only constraint locally rather than trusting model output.

**Step 2:** Add the conversation surface from the smart-collection section while retaining the existing manual create and context-menu flows.

**Step 3:** Convert the validated plan to a temporary smart collection, execute it locally, and show a keep/discard prompt.

**Step 4:** Persist temporary state only until the user decides; remove abandoned temporary collections on next library open.

**Step 5:** Run planner tests, typecheck, focused E2E, and manual dev-build verification.

### Task 7: Release verification

**Files:**
- Modify: `docs/` release notes if required

**Step 1:** Run `npm run typecheck`, relevant unit/worker tests, and `git diff --check`.

**Step 2:** Start the development build and manually verify: analyzed-only search, linked addition auto-analysis, one-file proposal acceptance, folder skip report, and temporary smart collection keep/discard.

**Step 3:** Commit implementation in coherent slices; package/release only after explicit user request.
