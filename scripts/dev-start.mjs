#!/usr/bin/env node
/**
 * Dev launcher for Electron Forge + Vite.
 *
 * 1. Picks a free loopback port and pins Vite to it with strictPort so the
 *    renderer URL injected into Main always matches the real server
 *    (avoids black screen when 5173 is occupied — Super-i6xg / Forge#3198).
 * 2. Optionally enables multi-instance via SUPER_ALLOW_MULTI_INSTANCE=1
 *    (separate userData; do not open the same library for writes in two GUIs).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { findFreeTcpPort } from "./free-port.mjs";
import { killStaleSuperDevProcesses } from "./kill-stale-dev.mjs";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Orphan Electron after Ctrl+C is the most common black-screen restart path.
killStaleSuperDevProcesses(projectRoot);
await new Promise((resolve) => setTimeout(resolve, 400));

if (
  process.argv.includes("--multi") ||
  process.env.SUPER_ALLOW_MULTI_INSTANCE === "1"
) {
  process.env.SUPER_ALLOW_MULTI_INSTANCE = "1";
}

const preferredPort = Number(process.env.SUPER_VITE_PORT || 5173);

const port = await findFreeTcpPort(
  Number.isFinite(preferredPort) && preferredPort > 0 ? preferredPort : 5173,
);

if (port !== preferredPort) {
  console.log(
    `[super:dev] port ${preferredPort} busy → using ${port} for Vite (strictPort)`,
  );
} else {
  console.log(`[super:dev] Vite renderer on http://localhost:${port}`);
}

if (process.env.SUPER_ALLOW_MULTI_INSTANCE === "1") {
  console.log(
    "[super:dev] multi-instance enabled (isolated userData). Avoid writing the same library from two GUIs.",
  );
}

if (process.env.SUPER_DISTRIBUTION === undefined && process.env.SUPER_DISTRIBUTION === undefined) {
  console.log(
    "[super:dev] app updates enabled (default installed distribution; SUPER_DISTRIBUTION=portable|development to override).",
  );
}

const forgeBin = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-forge.cmd" : "electron-forge",
);

const forgeArgs = process.argv.slice(2).filter((arg) => arg !== "--multi");

function cleanupDevTree() {
  killStaleSuperDevProcesses(projectRoot);
}

const child = spawn(forgeBin, ["start", ...forgeArgs], {
  cwd: projectRoot,
  env: {
    ...process.env,
    SUPER_VITE_PORT: String(port),
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  cleanupDevTree();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanupDevTree();
    child.kill(signal);
  });
}
