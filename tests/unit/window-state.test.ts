import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveStoredWindowBounds,
  WindowStateStore,
  type DisplayWorkArea,
  type WindowBounds,
} from "../../src/main/window-state";

const temporaryDirectories: string[] = [];
const displays: DisplayWorkArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "super-window-state-"));
  temporaryDirectories.push(directory);
  return directory;
}

function windowStub(
  bounds: WindowBounds,
  flags: { maximized?: boolean; minimized?: boolean; fullScreen?: boolean } = {},
) {
  return {
    getNormalBounds: () => bounds,
    isMaximized: () => flags.maximized === true,
    isMinimized: () => flags.minimized === true,
    isFullScreen: () => flags.fullScreen === true,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("window state store", () => {
  it("defaults to remembering the window and has no placement", () => {
    const store = new WindowStateStore(temporaryDirectory());
    expect(store.preferences).toEqual({ rememberWindowState: true });
    expect(store.readPlacement(displays)).toBeUndefined();
  });

  it("persists normal bounds and restores them after reload", () => {
    const directory = temporaryDirectory();
    const store = new WindowStateStore(directory);
    const bounds = { x: 120, y: 80, width: 1200, height: 800 };
    expect(store.recordPlacement(windowStub(bounds))).toBe(true);
    expect(store.readPlacement(displays)).toEqual({ bounds, maximized: false, fullscreen: false });

    const reloaded = new WindowStateStore(directory);
    expect(reloaded.readPlacement(displays)).toEqual({ bounds, maximized: false, fullscreen: false });
    expect(JSON.parse(readFileSync(reloaded.filePath, "utf8"))).toMatchObject({
      version: 1,
      rememberWindowState: true,
      bounds,
      maximized: false,
    });
  });

  it("keeps normal bounds and the maximized flag for a maximized window", () => {
    const store = new WindowStateStore(temporaryDirectory());
    const bounds = { x: 40, y: 20, width: 1200, height: 800 };
    store.recordPlacement(windowStub(bounds, { maximized: true }));
    expect(store.readPlacement(displays)).toEqual({ bounds, maximized: true, fullscreen: false });
  });

  it("persists the fullscreen flag with normal bounds", () => {
    const directory = temporaryDirectory();
    const store = new WindowStateStore(directory);
    const bounds = { x: 40, y: 20, width: 1200, height: 800 };
    expect(store.recordPlacement(windowStub(bounds, { fullScreen: true }))).toBe(true);
    expect(store.readPlacement(displays)).toEqual({
      bounds,
      maximized: false,
      fullscreen: true,
    });

    const reloaded = new WindowStateStore(directory);
    expect(reloaded.readPlacement(displays)).toEqual({
      bounds,
      maximized: false,
      fullscreen: true,
    });
  });

  it("disables restore but keeps the preference across reloads", () => {
    const directory = temporaryDirectory();
    const store = new WindowStateStore(directory);
    store.recordPlacement(windowStub({ x: 10, y: 10, width: 1200, height: 800 }));
    expect(store.setRememberWindowState(false)).toEqual({ rememberWindowState: false });
    expect(store.readPlacement(displays)).toBeUndefined();

    const reloaded = new WindowStateStore(directory);
    expect(reloaded.preferences).toEqual({ rememberWindowState: false });
    expect(reloaded.readPlacement(displays)).toBeUndefined();
    expect(reloaded.setRememberWindowState(true)).toEqual({ rememberWindowState: true });
    expect(reloaded.readPlacement(displays)).toEqual({
      bounds: { x: 10, y: 10, width: 1200, height: 800 },
      maximized: false,
      fullscreen: false,
    });
  });

  it("does not restore an off-screen placement", () => {
    const store = new WindowStateStore(temporaryDirectory());
    store.recordPlacement(windowStub({ x: 5000, y: 5000, width: 1200, height: 800 }));
    expect(store.readPlacement(displays)).toBeUndefined();
  });

  it("clamps a saved placement to the minimum useful window size", () => {
    const store = new WindowStateStore(temporaryDirectory());
    store.recordPlacement(windowStub({ x: 10, y: 10, width: 500, height: 400 }));
    expect(store.readPlacement(displays)).toEqual({
      bounds: { x: 10, y: 10, width: 1040, height: 680 },
      maximized: false,
      fullscreen: false,
    });
  });

  it("ignores the minimized state while keeping the last placement", () => {
    const store = new WindowStateStore(temporaryDirectory());
    const normal = { x: 10, y: 10, width: 1200, height: 800 };
    store.recordPlacement(windowStub(normal));
    expect(store.recordPlacement(windowStub(normal, { minimized: true }))).toBe(false);
    expect(store.readPlacement(displays)).toEqual({
      bounds: normal,
      maximized: false,
      fullscreen: false,
    });
  });

  it("falls back to defaults for a corrupt state file", () => {
    const directory = temporaryDirectory();
    writeFileSync(path.join(directory, "window-state.json"), "{not json", "utf8");
    const store = new WindowStateStore(directory);
    expect(store.preferences).toEqual({ rememberWindowState: true });
    expect(store.readPlacement(displays)).toBeUndefined();
  });

  it("rejects a placement with no usable visible area", () => {
    expect(resolveStoredWindowBounds(
      { x: 0, y: 0, width: 500, height: 400 },
      [{ x: 2000, y: 0, width: 1920, height: 1080 }],
    )).toBeUndefined();
    expect(resolveStoredWindowBounds(
      { x: 0, y: 0, width: 500, height: 400 },
      displays,
    )).toEqual({ x: 0, y: 0, width: 1040, height: 680 });
  });
});