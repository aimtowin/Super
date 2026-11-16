import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

import {
  dismissQuickStart,
  electronLaunchEnv,
  resolveElectronExecutablePath,
} from "./electron-test-helpers";

test.describe.configure({ timeout: 180_000 });

type WindowStateBridge = {
  getPreferences(): Promise<{ rememberWindowState: boolean }>;
  setRememberWindowState(rememberWindowState: boolean): Promise<{ rememberWindowState: boolean }>;
};

type WindowBounds = { x: number; y: number; width: number; height: number };

async function launch(profile: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [process.cwd()],
    cwd: process.cwd(),
    executablePath: resolveElectronExecutablePath(),
    env: electronLaunchEnv({
      SUPER_E2E: "1",
      SUPER_E2E_USER_DATA_PATH: profile,
      SUPER_DISABLE_AUTOMATIC_UPDATES: "1",
    }),
  });
}

async function preferences(window: Page): Promise<{ rememberWindowState: boolean }> {
  return window.evaluate(async () => {
    const api = (globalThis as typeof globalThis & {
      super?: { windowState?: WindowStateBridge };
    }).super?.windowState;
    if (api === undefined) throw new Error("Window-state bridge unavailable.");
    return api.getPreferences();
  });
}

async function setRememberWindowState(window: Page, remember: boolean): Promise<void> {
  await window.evaluate(async (next: boolean) => {
    const api = (globalThis as typeof globalThis & {
      super?: { windowState?: WindowStateBridge };
    }).super?.windowState;
    if (api === undefined) throw new Error("Window-state bridge unavailable.");
    await api.setRememberWindowState(next);
  }, remember);
}

async function setBounds(
  application: ElectronApplication,
  bounds: WindowBounds,
): Promise<WindowBounds> {
  return application.evaluate(async ({ BrowserWindow }, next: WindowBounds) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("Main window is missing.");
    if (window.isMaximized()) window.unmaximize();
    await new Promise((resolve) => setTimeout(resolve, 150));
    window.setBounds(next);
    await new Promise((resolve) => setTimeout(resolve, 150));
    return window.getBounds();
  }, bounds);
}

async function closeApplication(
  application: ElectronApplication,
  window: Page,
): Promise<void> {
  // The Windows close button hides the frameless window to the tray; that hide
  // path is the normal user close and must persist the placement.
  await window.locator(".windows-caption-button-close").dispatchEvent("click");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await application.close().catch(() => undefined);
}

async function readWindowState(application: ElectronApplication): Promise<{
  bounds: WindowBounds;
  maximized: boolean;
}> {
  return application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("Main window is missing.");
    return { bounds: window.getBounds(), maximized: window.isMaximized() };
  });
}

test("restores the last window placement and honors the opt-out", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "super-window-state-e2e-"));
  const profile = path.join(root, "profile");
  mkdirSync(profile);

  let application: ElectronApplication | undefined;
  try {
    application = await launch(profile);
    let window = await application.firstWindow();
    await dismissQuickStart(window);
    expect(await preferences(window)).toEqual({ rememberWindowState: true });

    const applied = await setBounds(application, { x: 120, y: 80, width: 1200, height: 800 });
    expect(applied.width).toBe(1200);
    expect(applied.height).toBe(800);
    await closeApplication(application, window);

    application = await launch(profile);
    window = await application.firstWindow();
    const restored = await readWindowState(application);
    expect(restored.maximized).toBe(false);
    expect(restored.bounds.width).toBe(1200);
    expect(restored.bounds.height).toBe(800);
    expect(Math.abs(restored.bounds.x - 120)).toBeLessThanOrEqual(2);
    expect(Math.abs(restored.bounds.y - 80)).toBeLessThanOrEqual(2);

    await setRememberWindowState(window, false);
    await expect.poll(async () => (await preferences(window)).rememberWindowState).toBe(false);
    await closeApplication(application, window);

    application = await launch(profile);
    window = await application.firstWindow();
    const defaultPlacement = await readWindowState(application);
    const workArea = await application.evaluate(
      ({ screen }) => screen.getPrimaryDisplay().workAreaSize,
    );
    expect(defaultPlacement.maximized).toBe(false);
    expect(defaultPlacement.bounds.width).toBe(Math.min(1440, workArea.width));
    expect(defaultPlacement.bounds.height).toBe(Math.min(900, workArea.height));
    expect(await preferences(window)).toEqual({ rememberWindowState: false });
  } finally {
    if (application !== undefined) await application.close().catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
});