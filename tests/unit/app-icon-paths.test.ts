import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveAppIconCandidates } from "../../src/main/app-icon-paths";

describe("resolveAppIconCandidates", () => {
  it("prefers the padded Dock PNG for macOS in development", () => {
    expect(
      resolveAppIconCandidates({
        cwd: "/workspace/Super",
        isPackaged: false,
        platform: "darwin",
        resourcesPath: "/unused/resources",
      }),
    ).toEqual([
      path.join("/workspace/Super", "assets/icons/app-dock.png"),
      path.join("/workspace/Super", "assets/icons/app.png"),
    ]);
  });

  it("prefers the packaged padded Dock PNG on macOS", () => {
    expect(
      resolveAppIconCandidates({
        cwd: "/unused/project",
        isPackaged: true,
        platform: "darwin",
        resourcesPath: "/Applications/Super.app/Contents/Resources",
      }),
    ).toEqual([
      path.join("/Applications/Super.app/Contents/Resources", "app-dock.png"),
      path.join("/Applications/Super.app/Contents/Resources", "app.png"),
    ]);
  });

  it("keeps Windows PNG/ICO fallback ordering", () => {
    expect(
      resolveAppIconCandidates({
        cwd: "/workspace/Super",
        isPackaged: true,
        platform: "win32",
        resourcesPath: "C:\\Super\\resources",
      }),
    ).toEqual([
      path.join("C:\\Super\\resources", "app.png"),
      path.join("C:\\Super\\resources", "app.ico"),
    ]);
  });
});
