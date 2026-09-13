/** Shared release-retention policy for Super's complete and delta packages. */
export const FULL_RELEASE_RETENTION = 5;
export const DELTA_SOURCE_RETENTION = 20;
export const MAX_DELTA_TO_FULL_RATIO = 0.6;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/u;

function parseVersion(value) {
  if (typeof value !== 'string') return undefined;
  const match = SEMVER.exec(value);
  if (match === null) return undefined;
  const core = match.slice(1, 4).map(Number);
  if (core.some((part) => !Number.isSafeInteger(part))) return undefined;
  return { core, prerelease: match[4]?.split('.') ?? [] };
}

function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) {
    if (left.length === right.length) return 0;
    return left.length === 0 ? 1 : -1;
  }
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/u.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/u.test(rightPart) ? Number(rightPart) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber;
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

/** Returns a semver comparison result, or undefined for an invalid input. */
export function compareReleaseVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  if (left === undefined || right === undefined) return undefined;
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

/** Select the newest valid source versions below the target release. */
export function selectRetainedDeltaSources(versions, currentVersion, limit = DELTA_SOURCE_RETENTION) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Delta source retention must be a positive integer.');
  if (parseVersion(currentVersion) === undefined) throw new Error('Current release version is invalid.');
  const unique = new Set();
  for (const version of versions) {
    const comparison = compareReleaseVersions(version, currentVersion);
    if (comparison !== undefined && comparison < 0) unique.add(version);
  }
  return [...unique]
    .sort((left, right) => compareReleaseVersions(right, left) ?? 0)
    .slice(0, limit);
}

/** Skip deltas that save too little bandwidth to justify publishing them. */
export function isDeltaWithinSizeLimit(deltaBytes, fullBytes, ratio = MAX_DELTA_TO_FULL_RATIO) {
  return Number.isSafeInteger(deltaBytes)
    && Number.isSafeInteger(fullBytes)
    && Number.isFinite(ratio)
    && deltaBytes > 0
    && fullBytes > 0
    && ratio > 0
    && ratio <= 1
    && deltaBytes <= fullBytes * ratio;
}
