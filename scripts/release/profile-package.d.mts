import type { PackageInspection } from './build-provenance.mjs';

export type PackageProfile = {
  mode: 'payload-inspection-only'; provenanceVerified: false; platform: string;
  samples: { round: number; fingerprint: string; metrics: PackageInspection['metrics'] }[];
};

/** Does not write receipts, execute a packaged app or verify source provenance. */
export function profilePackage(options: {
  repoRoot: string; packageRoot: string; platform: string; concurrency?: number[]; rounds?: number;
}): Promise<PackageProfile>;
