import type { BuildFileDigest, PackageBuildReceipt } from './build-provenance.mjs';

export type ArtifactKind = 'full-installer' | 'full-update' | 'delta' | 'forge-zip' | 'dmg';
export type ArtifactPackagePorts = {
  repoRoot: string; packageRoot: string; packageReceipt: PackageBuildReceipt; targetVersion: string; platform: string;
};
export type DerivativeReceipt = {
  schemaVersion: 1; derivativeId: string; buildId: string; targetVersion: string; platform: string; kind: ArtifactKind;
  packageFingerprint: string; inputFingerprint: string; artifact: BuildFileDigest;
  installer?: { bytes: number; sha256: string }; fromVersion?: string; baseline?: BuildFileDigest;
};
export type OfficialArtifact = Omit<BuildFileDigest, 'kind' | 'target'> & { kind: ArtifactKind; remoteName: string; derivativeId: string; fromVersion?: string };
export type ArtifactManifest = {
  schemaVersion: 1; buildId: string; targetVersion: string; platform: string; packageFingerprint: string;
  artifacts: OfficialArtifact[]; fingerprint: string;
};
export type LegacyBaseline = { version: string; runtimeVersion?: string; files: { path: string; size: number; sha256: string }[] };

export function validateLegacyBaseline(value: unknown, version: string): LegacyBaseline;
export function bindDerivativeProvenance(options: ArtifactPackagePorts & {
  derivativeId: string; artifactKind: ArtifactKind; artifactPath: string; installerPath?: string; fromVersion?: string; baselinePath?: string;
}): Promise<{ receipt: DerivativeReceipt; receiptPath: string }>;
export function loadArtifactDerivative(options: ArtifactPackagePorts & { artifactPath: string }): Promise<DerivativeReceipt>;
export function createArtifactManifest(options: ArtifactPackagePorts & { derivativeReceiptPaths?: string[]; baselineDirectory?: string }): Promise<ArtifactManifest>;
export function verifyArtifactManifest(options: ArtifactPackagePorts & { manifest: ArtifactManifest }): Promise<void>;
export function writeArtifactChecksums(options: ArtifactPackagePorts & { manifest: ArtifactManifest; outputPath: string }):
  Promise<{ checksumPath: string; sidecars: string[] }>;
