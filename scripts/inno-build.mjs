#!/usr/bin/env node
/**
 * Super Windows 安装器（Inno Setup）构建脚本。
 *
 * 流程：ISCC.exe 编译 assets/inno/supersetup.iss → out/make/inno/SuperSetup.exe，
 * 并校验产物（存在 + 非空）。
 *
 * 前置：
 *   - 已执行 npm run package（Inno 从 out/Super-win32-x64 打包）
 *   - Inno Setup 工具：SUPER_INNO_TOOLS 指向含 ISCC.exe 的目录，否则
 *     默认 %LOCALAPPDATA%\SuperTools\inno\tools（NuGet Tools.InnoSetup
 *     解压即用，见 CLAUDE.md）
 *
 * 用法：node scripts/inno-build.mjs [--out <dir>]
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, statSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 从 package.json 读版本（npm version 提升后自动跟随）。 */
function packageVersion() {
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    );
    if (typeof manifest.version === 'string' && manifest.version.trim()) {
      return manifest.version.trim();
    }
  } catch {
    // fall through to default
  }
  return '0.1.0';
}

const defaultIscc = process.env.SUPER_INNO_TOOLS
  ? path.resolve(process.env.SUPER_INNO_TOOLS, 'ISCC.exe')
  : path.join(process.env.LOCALAPPDATA || '', 'SuperTools', 'inno', 'tools', 'ISCC.exe');

const defaultOut = path.join(repoRoot, 'out', 'make', 'inno');

function fail(message) {
  console.error(`[inno-build] FAILED: ${message}`);
  process.exit(1);
}

function createUpdateArchive(setupExe, outputDirectory, version) {
  const archivePath = path.join(
    outputDirectory,
    `Super-win-x86-64-${version}-setup.zip`,
  );
  rmSync(archivePath, { force: true });
  return new Promise((resolve, reject) => {
    const output = createWriteStream(archivePath, { flags: 'wx' });
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.once('close', () => resolve(archivePath));
    output.once('error', reject);
    archive.once('error', reject);
    archive.pipe(output);
    archive.file(setupExe, { name: 'SuperSetup.exe' });
    void archive.finalize();
  });
}

async function main() {
  const outDir = process.argv.includes('--out')
    ? path.resolve(process.argv[process.argv.indexOf('--out') + 1])
    : defaultOut;

  if (!existsSync(defaultIscc)) {
    fail(`ISCC.exe not found at ${defaultIscc} (set SUPER_INNO_TOOLS or install per CLAUDE.md)`);
  }
  const packageDir = path.join(repoRoot, 'out', 'Super-win32-x64');
  if (!existsSync(packageDir)) {
    fail(`Packaged app not found: ${packageDir} (run npm run package first)`);
  }

  mkdirSync(outDir, { recursive: true });
  const version = packageVersion();
  const result = spawnSync(
    defaultIscc,
    [
      `/DAppVersion=${version}`,
      path.join(repoRoot, 'assets', 'inno', 'supersetup.iss'),
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
    },
  );
  if (result.error || result.status !== 0) {
    fail(`ISCC exited with ${String(result.status)} (${result.error?.message ?? 'see output above'})`);
  }

  const setupExe = path.join(outDir, 'SuperSetup.exe');
  if (!existsSync(setupExe) || statSync(setupExe).size < 100 * 1024 * 1024) {
    fail(`Installer not produced or suspiciously small: ${setupExe}`);
  }
  console.log(`[inno-build] Windows installer written to ${setupExe} (${(statSync(setupExe).size / 1024 / 1024).toFixed(1)} MB)`);
  const updateArchive = await createUpdateArchive(setupExe, path.dirname(outDir), version);
  if (!existsSync(updateArchive) || statSync(updateArchive).size === 0) {
    fail(`Update archive was not produced: ${updateArchive}`);
  }
  console.log(`[inno-build] GitHub update archive written to ${updateArchive}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
