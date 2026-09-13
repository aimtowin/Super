import { describe, expect, it } from 'vitest';

import {
  DELTA_SOURCE_RETENTION,
  FULL_RELEASE_RETENTION,
  MAX_DELTA_TO_FULL_RATIO,
  compareReleaseVersions,
  isDeltaWithinSizeLimit,
  selectRetainedDeltaSources,
} from '../../scripts/release/update-retention-policy.mjs';

describe('release update retention policy', () => {
  it('keeps five complete release directories and twenty direct delta sources', () => {
    expect(FULL_RELEASE_RETENTION).toBe(5);
    expect(DELTA_SOURCE_RETENTION).toBe(20);
  });

  it('selects the twenty newest valid versions strictly below the current release', () => {
    const versions = Array.from({ length: 25 }, (_value, index) => `2.2.${index}`);
    expect(selectRetainedDeltaSources([...versions, 'invalid', '2.2.25', '9.0.0'], '2.2.25')).toEqual(
      Array.from({ length: 20 }, (_value, index) => `2.2.${24 - index}`),
    );
  });

  it('orders release candidates using semver prerelease precedence', () => {
    expect(compareReleaseVersions('2.3.0-beta.2', '2.3.0-beta.10')).toBeLessThan(0);
    expect(compareReleaseVersions('2.3.0', '2.3.0-rc.1')).toBeGreaterThan(0);
  });

  it('keeps a delta only when it is at most sixty percent of the full archive', () => {
    expect(isDeltaWithinSizeLimit(60, 100)).toBe(true);
    expect(isDeltaWithinSizeLimit(61, 100)).toBe(false);
    expect(isDeltaWithinSizeLimit(1, 0)).toBe(false);
    expect(MAX_DELTA_TO_FULL_RATIO).toBe(0.6);
  });
});
