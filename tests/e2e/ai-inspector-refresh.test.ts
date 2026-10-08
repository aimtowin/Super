import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import sharp from "sharp";
import type { AppLogEntry } from "../../src/shared/app-log";
import type { SuperLibraryApi } from "../../src/shared/library-api";

import { resolveElectronExecutablePath, resolveSessionLogPath } from "./electron-test-helpers";

test.describe.configure({ timeout: 180_000 });

type HydrationProbe = {
  original: (...args: unknown[]) => unknown;
  release: () => void;
  firstPageInvocations: number;
  completedFirstPages: number;
  rootCountHeld: boolean;
};
type ProbeGlobal = typeof globalThis & { __superA7HydrationProbe?: HydrationProbe };

async function installHydrationProbe(application: ElectronApplication, libraryId: string): Promise<void> {
  await application.evaluate(({ ipcMain }, libraryId) => {
    const channel = "super:library:request";
    const host = globalThis as ProbeGlobal;
    if (host.__superA7HydrationProbe) throw new Error("Hydration IPC fixture is already installed.");
    // Test-only Electron private API: detect support explicitly. An unsupported
    // build is a fixture failure, not a claimed business regression.
    const handlers = (ipcMain as unknown as { _invokeHandlers?: Map<string, (...args: unknown[]) => unknown> })._invokeHandlers;
    const original = handlers?.get(channel);
    if (!original) throw new Error("Hydration IPC fixture requires the existing authorized Main handler.");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const probe: HydrationProbe = { original, release, firstPageInvocations: 0, completedFirstPages: 0, rootCountHeld: false };
    host.__superA7HydrationProbe = probe;
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, input: unknown) => {
      const command = input as { type?: string; libraryId?: string; limit?: number; offset?: number;
        idsOnly?: boolean; layoutOnly?: boolean; scope?: { kind?: string; folderId?: string | null } };
      const search = command?.type === "asset.search.request" && command.libraryId === libraryId;
      const firstPage = search && command.limit === 100 && command.offset === 0 && !command.idsOnly && !command.layoutOnly;
      if (firstPage) probe.firstPageInvocations += 1;
      // Preserve original authorization, parsing and Main -> Worker execution.
      // Only the completed first root-count response is held from the renderer.
      const result = await original(event, input);
      if (firstPage && (result as { ok?: boolean })?.ok === true) probe.completedFirstPages += 1;
      if (search && command.limit === 1 && command.scope?.kind === "folder"
        && command.scope.folderId === null && !probe.rootCountHeld) {
        probe.rootCountHeld = true;
        await gate;
      }
      return result;
    });
  }, libraryId);
}

async function hydrationProbeStats(application: ElectronApplication) {
  return application.evaluate(() => {
    const probe = (globalThis as ProbeGlobal).__superA7HydrationProbe;
    if (!probe) throw new Error("Missing owned hydration IPC fixture.");
    return { firstPageInvocations: probe.firstPageInvocations, completedFirstPages: probe.completedFirstPages, rootCountHeld: probe.rootCountHeld };
  });
}

async function releaseHydrationProbe(application: ElectronApplication, restore = false): Promise<void> {
  await application.evaluate(({ ipcMain }, restore) => {
    const host = globalThis as ProbeGlobal;
    const probe = host.__superA7HydrationProbe;
    if (!probe) return;
    probe.release();
    if (restore) {
      ipcMain.removeHandler("super:library:request");
      ipcMain.handle("super:library:request", probe.original);
      delete host.__superA7HydrationProbe;
    }
  }, restore);
}

/**
 * Super-c9r3 / REQ-INSPECT-006 regression: after an AI analysis completes
 * (tags/description/rating written), the Inspector must show the new content
 * immediately — without a reselect or any manual refresh.
 *
 * The AI endpoint is a local mock OpenAI-compatible server; the API key is
 * entered through the settings UI (it is safeStorage-encrypted and cannot be
 * pre-seeded from outside the app).
 */
test("Inspector refreshes immediately after AI analysis completes", async () => {
  const analysisRequests: Array<{ body: string }> = [];
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      if (
        request.method === "POST" &&
        request.url?.endsWith("/chat/completions")
      ) {
        analysisRequests.push({ body });
        const isProbe = body.includes("Reply with the single word OK");
        const content = isProbe
          ? "OK"
          : JSON.stringify({
              description: "AI 生成的验收描述",
              tags: ["ai测试标签"],
              rating: 4,
            });
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [{ message: { content } }],
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), "super-ai-refresh-e2e-"),
  );
  const libraryName = "AI 刷新验收";
  const libraryPath = path.join(temporaryRoot, libraryName);
  const userDataPath = path.join(temporaryRoot, "user-data");

  // Pre-seed the AI endpoint configuration (key stays empty — it is entered
  // through the settings UI so safeStorage can encrypt it in-process).
  mkdirSync(userDataPath, { recursive: true });
  writeFileSync(
    path.join(userDataPath, "ai-config.json"),
    JSON.stringify(
      {
        apiFormat: "openai_chat",
        model: "gpt-4o-mini",
        baseUrl: `http://127.0.0.1:${port}/v1`,
        descriptionEnabled: true,
        tagEnabled: true,
        ratingEnabled: true,
        analysisSettings: {
          forceExistingTags: false,
        },
        concurrencyLimit: 2,
        maxAnalysisImageEdgePx: 2048,
        languages: ["zh-CN"],
        autoAnalyzeEnabled: false,
        disclaimerAccepted: true,
      },
      null,
      2,
    ),
  );

  const imagePath = path.join(temporaryRoot, "sample.png");
  await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: { r: 96, g: 160, b: 224 },
    },
  })
    .png()
    .toFile(imagePath);

  const applicationDirectory =
    process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const application = await electron.launch({
    args: [applicationDirectory],
    cwd: applicationDirectory,
    executablePath: resolveElectronExecutablePath(),
    env: {
      ...process.env,
      SUPER_E2E: "1",
      SUPER_E2E_CREATE_PARENT_PATH: temporaryRoot,
      SUPER_E2E_OPEN_LIBRARY_PATH: libraryPath,
      SUPER_E2E_USER_DATA_PATH: userDataPath,
      SUPER_E2E_IMPORT_FILES: imagePath,
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole("button", { name: "跳过引导", exact: true }).click();
    await window.getByRole("button", { name: "创建资源库" }).click();
    await window.getByRole("textbox", { name: "名称" }).fill(libraryName);
    await window.getByRole("button", { name: "创建", exact: true }).click();
    await window
      .getByRole("button", { name: "导入文件", exact: true })
      .first()
      .click();

    // Configure the API key through the settings UI (safeStorage encryption).
    await window.getByRole("button", { name: "主菜单" }).click();
    await window.getByRole("menuitem", { name: "设置" }).click();
    const dialog = window.getByRole("dialog", { name: "通用设置" });
    await dialog.getByRole("tab", { name: "AI", exact: true }).click();
    await dialog.locator("#ai-config-base-url").fill(`http://127.0.0.1:${port}/v1`);
    await dialog.locator("#ai-config-api-key").fill("test-key");
    // aiConfig.save is missing from both catalogs, so the button currently
    // renders the raw key ("aiConfig.save") — accept either form.
    await dialog
      .getByRole("button", { name: /保存|aiConfig\.save/ })
      .click();
    // The save probes the endpoint and keeps the settings page open on
    // success ("验证通过后将保留当前设置页"); wait for the probe, then
    // close the dialog with Escape.
    await expect
      .poll(() => analysisRequests.length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    await dialog.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Select the asset (Inspector opens) and start the AI analysis.
    const card = window.locator(".asset-card").filter({ hasText: "sample.png" });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    await card.click({ button: "right" });
    await window.getByRole("menuitem", { name: "AI 分析" }).click();

    // Wait for the analysis request (distinct from the probe).
    await expect
      .poll(
        () =>
          analysisRequests.filter((request) =>
            request.body.includes("Reply with the single word OK"),
          ).length >= 1 &&
          analysisRequests.some(
            (request) => !request.body.includes("Reply with the single word OK"),
          ),
        { timeout: 60_000 },
      )
      .toBe(true);

    // THE regression assertion: the AI tag and the AI-generated description
    // appear in the Inspector without any reselect or manual refresh, shortly
    // after completion.
    const inspector = window.locator(".inspector-pane");
    await expect(inspector.getByText("ai测试标签")).toBeVisible({
      timeout: 15_000,
    });
    await expect(inspector.locator("#meta-desc")).toHaveValue(
      "AI 生成的验收描述",
      { timeout: 15_000 },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await application.close();
  }
});

test("Inspector refreshes after a BATCH AI analysis completes", async () => {
  const analysisRequests: Array<{ body: string }> = [];
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      if (
        request.method === "POST" &&
        request.url?.endsWith("/chat/completions")
      ) {
        analysisRequests.push({ body });
        const isProbe = body.includes("Reply with the single word OK");
        const content = isProbe
          ? "OK"
          : JSON.stringify({
              description: "批量分析生成的描述",
              tags: ["批量分析标签"],
              rating: 3,
            });
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [{ message: { content } }],
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), "super-ai-refresh-batch-e2e-"),
  );
  const libraryName = "AI 批量刷新验收";
  const libraryPath = path.join(temporaryRoot, libraryName);
  const userDataPath = path.join(temporaryRoot, "user-data");
  mkdirSync(userDataPath, { recursive: true });
  writeFileSync(
    path.join(userDataPath, "ai-config.json"),
    JSON.stringify(
      {
        apiFormat: "openai_chat",
        model: "gpt-4o-mini",
        baseUrl: `http://127.0.0.1:${port}/v1`,
        descriptionEnabled: true,
        tagEnabled: true,
        ratingEnabled: true,
        analysisSettings: { forceExistingTags: false },
        concurrencyLimit: 2,
        maxAnalysisImageEdgePx: 2048,
        languages: ["zh-CN"],
        autoAnalyzeEnabled: false,
        disclaimerAccepted: true,
      },
      null,
      2,
    ),
  );

  const firstImage = path.join(temporaryRoot, "batch-a.png");
  const secondImage = path.join(temporaryRoot, "batch-b.png");
  await sharp({
    create: { width: 200, height: 150, channels: 3, background: { r: 200, g: 80, b: 60 } },
  }).png().toFile(firstImage);
  await sharp({
    create: { width: 200, height: 150, channels: 3, background: { r: 60, g: 120, b: 200 } },
  }).png().toFile(secondImage);

  const applicationDirectory =
    process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const application = await electron.launch({
    args: [applicationDirectory],
    cwd: applicationDirectory,
    executablePath: resolveElectronExecutablePath(),
    env: {
      ...process.env,
      SUPER_E2E: "1",
      SUPER_E2E_CREATE_PARENT_PATH: temporaryRoot,
      SUPER_E2E_OPEN_LIBRARY_PATH: libraryPath,
      SUPER_E2E_USER_DATA_PATH: userDataPath,
      SUPER_E2E_IMPORT_FILES: [firstImage, secondImage].join(path.delimiter),
      SUPER_WORKER_CMD_LOG: "1",
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole("button", { name: "跳过引导", exact: true }).click();
    await window.getByRole("button", { name: "创建资源库" }).click();
    await window.getByRole("textbox", { name: "名称" }).fill(libraryName);
    await window.getByRole("button", { name: "创建", exact: true }).click();
    await window
      .getByRole("button", { name: "导入文件", exact: true })
      .first()
      .click();

    // Configure the API key (probe must land).
    await window.getByRole("button", { name: "主菜单" }).click();
    await window.getByRole("menuitem", { name: "设置" }).click();
    const dialog = window.getByRole("dialog", { name: "通用设置" });
    await dialog.getByRole("tab", { name: "AI", exact: true }).click();
    await dialog.locator("#ai-config-base-url").fill(`http://127.0.0.1:${port}/v1`);
    await dialog.locator("#ai-config-api-key").fill("test-key");
    await dialog
      .getByRole("button", { name: /保存|aiConfig\.save/ })
      .click();
    await expect
      .poll(() => analysisRequests.length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    await dialog.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Multi-select both assets, then run the batch AI analysis from the
    // context menu of the primary asset.
    const primaryCard = window.locator(".asset-card").filter({ hasText: "batch-a.png" });
    const secondCard = window.locator(".asset-card").filter({ hasText: "batch-b.png" });
    await expect(primaryCard).toBeVisible({ timeout: 15_000 });
    await expect(secondCard).toBeVisible({ timeout: 15_000 });
    await primaryCard.click();
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await secondCard.click({ modifiers: [modifier as "Control" | "Meta"] });
    const libraryId = await window.evaluate(async () => {
      const api = (window as unknown as { super: { library: SuperLibraryApi } }).super.library;
      const result = await api.listOpen();
      if (!result.ok || !result.value[0]) throw new Error("Missing isolated batch library.");
      return result.value[0].libraryId;
    });
    const logsPath = await application.evaluate(({ app }) => app.getPath("logs"));
    const countWorkerSearches = () => readFileSync(resolveSessionLogPath(logsPath), "utf8").trim().split(/\r?\n/)
      .filter(Boolean).map((line) => JSON.parse(line) as AppLogEntry)
      .filter((entry) => entry.scope === "worker.cmd.roundtrip" && entry.context?.commandType === "asset.search").length;
    const workerSearchesBefore = countWorkerSearches();
    await installHydrationProbe(application, libraryId);
    await primaryCard.click({ button: "right" });
    await window
      .getByRole("menuitem", { name: /AI 分析（2 项）/ })
      .click();

    // Wait for BOTH batch analysis requests (two non-probe requests).
    await expect
      .poll(
        () =>
          analysisRequests.filter(
            (request) => !request.body.includes("Reply with the single word OK"),
          ).length >= 2,
        { timeout: 60_000 },
      )
      .toBe(true);

    // Both durable job completion and the real batch terminal UI must occur
    // while the same first hydration is held. The 100 injected completions are
    // only Renderer/preload event coverage; the batch itself uses real local AI.
    await expect.poll(async () => (await hydrationProbeStats(application)).rootCountHeld).toBe(true);
    await expect(window.locator(".workspace-notice-stack").getByText("AI 分析完成：成功 2 项、失败 0 项。", { exact: true })).toBeVisible();
    const assetId = await primaryCard.getAttribute("data-asset-id");
    expect(assetId).toBeTruthy();
    await application.evaluate(({ BrowserWindow }, payload) => {
      const target = BrowserWindow.getAllWindows().find((entry) => entry.isVisible());
      if (!target) throw new Error("Missing owned batch renderer.");
      for (let index = 0; index < 100; index += 1) target.webContents.send("super:ai:completed", {
        type: "ai.analysis.completed", libraryId: payload.libraryId, assetId: payload.assetId, fieldCount: 1, tagCount: 1,
      });
    }, { libraryId, assetId });
    // Includes ordinary mutation debounce; no first-page read may escape the
    // held hydration lease when either AI entry or a domain event fires.
    await window.waitForTimeout(650);
    const held = await hydrationProbeStats(application);
    expect(held.firstPageInvocations).toBe(1);
    expect(held.completedFirstPages).toBe(1);
    await expect.poll(() => countWorkerSearches() - workerSearchesBefore).toBe(3);
    const workerSearchesHeld = countWorkerSearches() - workerSearchesBefore;
    expect(workerSearchesHeld).toBe(3); // Actual Worker: first page + root + trash.
    await releaseHydrationProbe(application);
    await expect.poll(async () => (await hydrationProbeStats(application)).completedFirstPages).toBe(2);
    await window.waitForTimeout(650);
    const completed = await hydrationProbeStats(application);
    expect(completed.firstPageInvocations).toBe(2);
    await expect.poll(() => countWorkerSearches() - workerSearchesBefore).toBe(6);
    const workerSearchesCompleted = countWorkerSearches() - workerSearchesBefore;
    expect(workerSearchesCompleted).toBe(6);
    console.info("[ai-hydration-lease]", JSON.stringify({ held, completed, workerSearchesHeld, workerSearchesCompleted }));

    // The primary asset's Inspector must show the batch tag immediately.
    const inspector = window.locator(".inspector-pane");
    await expect(inspector.getByText("批量分析标签")).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    try {
      await releaseHydrationProbe(application, true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await application.close();
    }
  }
});
