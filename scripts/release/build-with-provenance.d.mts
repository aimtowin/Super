import type { ForgeConfig } from '@electron-forge/shared-types';
import type { PackageBuildReceipt } from './build-provenance.mjs';

export type BuildProcessOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: 'pipe' | 'inherit';
  shell: false;
};
export type BuildProcessResult = { status: number | null; stdout?: string; error?: Error };
export type BuildProcessPort = (command: string, argv: string[], options: BuildProcessOptions) => BuildProcessResult | Promise<BuildProcessResult>;
export type BuildWiringOptions = {
  repoRoot?: string;
  platform?: string;
  env?: NodeJS.ProcessEnv;
  run?: BuildProcessPort;
  loadForgeConfig?: (root: string) => ForgeConfig | Promise<ForgeConfig>;
  /** Test/embedding port; omitted production hooks use the actual Forge make CLI argv. */
  makeArgv?: string[];
};
export type BoundBuildReceipt = PackageBuildReceipt;

export function createBuildProvenanceHooks(options?: BuildWiringOptions): NonNullable<ForgeConfig['hooks']>;
export function runBuildWithProvenance(options: BuildWiringOptions & { command: 'package' | 'make'; argv?: string[] }):
  Promise<{ buildId: string; receiptPath: string } | { buildId: null; receiptPath: null }>;
export function loadPackageBuildProvenance(options: { repoRoot: string; packageRoot: string; targetVersion: string; platform: string }): Promise<BoundBuildReceipt>;
