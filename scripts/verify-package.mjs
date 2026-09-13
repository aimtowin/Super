import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  currentPlatformKey,
  verifyBundle,
  verifyReleaseProvenance,
} from './media-binaries-lib.mjs';

// fileURLToPath（而非 URL.pathname）保证 Windows 上盘符不丢失：
// file:///E:/repo/scripts/verify-package.mjs → E:\repo\scripts\verify-package.mjs
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const platformDirectory = `Super-${process.platform}-${process.arch}`;
const packageRoot = process.env.SUPER_PACKAGE_ROOT ?? path.resolve('out', platformDirectory);
const resourcesPath =
  process.platform === 'darwin'
    ? path.join(packageRoot, 'Super.app', 'Contents', 'Resources')
    : path.join(packageRoot, 'resources');
const appPath = path.join(resourcesPath, 'app');

const requiredPaths = [
  appPath,
  path.join(
    appPath,
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  ),
];

const systemTrashBinary = process.platform === 'darwin'
  ? 'macos-trash'
  : process.platform === 'win32'
    ? 'windows-trash.exe'
    : undefined;

if (!systemTrashBinary) {
  throw new Error(`Packaged system trash is not supported on ${process.platform}.`);
}

requiredPaths.push(path.join(
  appPath,
  'node_modules',
  'trash',
  'lib',
  systemTrashBinary,
));

const missingPaths = requiredPaths.filter((requiredPath) => !existsSync(requiredPath));
if (missingPaths.length > 0) {
  throw new Error(`Package is missing required runtime files:\n${missingPaths.join('\n')}`);
}

// Super Windows 事故（2026-08-21）：vcpkg 用户级 MSBuild 集成会把
// better-sqlite3 的静态 sqlite3 错解析为动态 sqlite3.dll，打包产物 .node
// 依赖缺失 DLL（Worker 加载失败 → 所有资源库打不开）。校验：
// 1) .node 体积下限（受控静态编译产物 ~1.9MB，坏编译产物仅 ~230KB）；
// 2) PE 导入表不得包含 sqlite3.dll（二进制扫描导入名）。
const sqliteNodePath = path.join(
  appPath,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node',
);
if (existsSync(sqliteNodePath)) {
  const nodeBytes = readFileSync(sqliteNodePath);
  if (nodeBytes.length < 500 * 1024) {
    throw new Error(
      `Packaged better_sqlite3.node is suspiciously small (${nodeBytes.length} bytes); ` +
        'it was likely compiled against the vcpkg sqlite3.dll. Rebuild with ' +
        'VcpkgEnabled=false (scripts/rebuild-native.mjs) before packaging.',
    );
  }
  if (nodeBytes.includes(Buffer.from('sqlite3.dll', 'utf8'))) {
    throw new Error(
      'Packaged better_sqlite3.node dynamically links sqlite3.dll (vcpkg pollution); ' +
        'the DLL is not shipped, so every library would fail to open. Rebuild with ' +
        'VcpkgEnabled=false before packaging.',
    );
  }
}

const requiredAsarEntries = [
  '.vite/build/plugin_standard_host.js',
  '.vite/build/plugin_trusted_host.js',
  '.vite/build/script_runtime_utility.js',
];
const missingRuntimeEntries = requiredAsarEntries.filter((entry) => !existsSync(path.join(appPath, entry)));
if (missingRuntimeEntries.length > 0) {
  throw new Error(
    `Package app directory is missing plugin/script Host utilities:\n${missingRuntimeEntries.join('\n')}`,
  );
}

const registrySource = readFileSync(
  path.join(projectRoot, 'src', 'automation', 'command-registry.ts'),
  'utf8',
);
const apiVersionMatch = registrySource.match(
  /export const AUTOMATION_API_VERSION = (\d+) as const;/u,
);
if (!apiVersionMatch) {
  throw new Error('Could not determine AUTOMATION_API_VERSION from the Registry source.');
}
const apiVersion = Number(apiVersionMatch[1]);
const declarationPath = path.join(
  projectRoot,
  'docs',
  'internal',
  'skills',
  'super-automation',
  'automation-api.d.ts',
);
if (!existsSync(declarationPath)) {
  throw new Error(`Workspace is missing generated automation declarations: ${declarationPath}`);
}
const declaration = readFileSync(declarationPath, 'utf8');
const declarationVersion = declaration.match(
  /AUTOMATION_API_VERSION:\s*(\d+)|AUTOMATION_API_VERSION\s*=\s*(\d+)/u,
);
if (!declarationVersion || Number(declarationVersion[1] ?? declarationVersion[2]) !== apiVersion) {
  throw new Error(
    `Automation declaration API version does not match Registry (expected ${apiVersion}).`,
  );
}
const commandIds = [
  ...registrySource.matchAll(/^\s*commandId:\s*'([^']+)'/gmu),
].map((match) => match[1]);
const missingDeclarationCommands = commandIds.filter(
  (commandId) => !declaration.includes(`'${commandId}'`),
);
if (missingDeclarationCommands.length > 0) {
  throw new Error(
    `Automation declaration is missing Registry commands:\n${missingDeclarationCommands.join('\n')}`,
  );
}

const mainPath = path.join(appPath, '.vite', 'build', 'main.js');
if (!existsSync(mainPath)) throw new Error('Package app directory is missing the Main process entry.');
const mainSource = readFileSync(mainPath, 'utf8');
if (!mainSource.includes(`AUTOMATION_API_VERSION`) || !mainSource.includes(String(apiVersion))) {
  throw new Error(
    `Packaged Main does not contain the Registry API version marker (expected ${apiVersion}).`,
  );
}

const mediaResourcesPath = path.join(resourcesPath, 'resources');
const mediaPlatform = currentPlatformKey();
verifyBundle({ root: mediaResourcesPath, platform: mediaPlatform });
if (process.env.SUPER_MEDIA_SKIP_PROVENANCE === '1') {
  console.warn(
    'Skipping packaged release provenance check (SUPER_MEDIA_SKIP_PROVENANCE=1). ' +
      'This is only valid for local build trials, not production release.',
  );
} else {
  verifyReleaseProvenance({ root: mediaResourcesPath, platform: mediaPlatform });
}

console.log(`Verified packaged runtime files in ${resourcesPath}`);
console.log(`Verified Host utilities in app directory: ${requiredAsarEntries.join(', ')}`);
