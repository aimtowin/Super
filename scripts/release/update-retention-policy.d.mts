export const FULL_RELEASE_RETENTION: 5;
export const DELTA_SOURCE_RETENTION: 20;
export const MAX_DELTA_TO_FULL_RATIO: 0.6;

export function compareReleaseVersions(leftValue: unknown, rightValue: unknown): number | undefined;
export function selectRetainedDeltaSources(
  versions: Iterable<string>,
  currentVersion: string,
  limit?: number,
): string[];
export function isDeltaWithinSizeLimit(deltaBytes: number, fullBytes: number, ratio?: number): boolean;
