export type BuildFileDigest = { path: string; bytes: number; sha256: string; kind?: never; target?: never };
/** Package-only darwin link entry. Its raw target is bound by the package fingerprint. */
export type BuildSymlinkRecord = { path: string; kind: 'symlink'; target: string; bytes?: never; sha256?: never };
export type PackagePayloadMember = BuildFileDigest | BuildSymlinkRecord;
export type CapturedMedia = {
  platform: string;
  bundle: { url: string; sha256: string; size: number; manifestSha256: string };
  sourceLockSha256: string;
  manifestPresent: boolean;
};
export type BuildReceiptIdentity = {
  schemaVersion: 1;
  buildId: string;
  sourceHead: string;
  targetVersion: string;
  platform: string;
  builderVersion: string;
  toolVersions: Record<string, string>;
  configuration: Record<string, boolean>;
  inputs: BuildFileDigest[];
  media: CapturedMedia;
  dirtyPaths: string[];
  inputFingerprint: string;
  dirtyFingerprint: string;
};
export type InputBuildReceipt = BuildReceiptIdentity & { phase: 'inputs' };
export type PackageBuildReceipt = BuildReceiptIdentity & {
  phase: 'package';
  package: { relativePath: string; files: PackagePayloadMember[]; fingerprint: string };
};
export type BuildReceipt = InputBuildReceipt | PackageBuildReceipt;
export type CaptureBuildOptions = {
  repoRoot: string;
  buildId: string;
  sourceHead: string;
  targetVersion: string;
  platform: string;
  builderVersion: string;
  toolVersions: Record<string, string>;
  configuration?: Record<string, unknown>;
  dirtyPaths?: string[];
};
export type BuildInputPorts = { repoRoot: string; receipt: BuildReceipt };
export type PackageBuildPorts = BuildInputPorts & { packageRoot: string; targetVersion: string; platform: string };

export function captureBuildProvenance(options: CaptureBuildOptions): Promise<InputBuildReceipt>;
/** Read-only pre-producer guard; does not certify complete generated media. */
export function verifyImmutableBuildInputs(options: BuildInputPorts): Promise<void>;
/** Final consuming proof, including complete pinned media and acquisition metadata. */
export function verifyBuildInputs(options: BuildInputPorts): Promise<void>;
export function bindPackageProvenance(options: PackageBuildPorts & { receiptPath: string }): Promise<PackageBuildReceipt>;
export function verifyPackageProvenance(options: PackageBuildPorts): Promise<void>;
