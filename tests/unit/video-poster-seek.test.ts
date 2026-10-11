import { describe, expect, it } from 'vitest';
import { videoPosterSeekSeconds } from '../../src/worker/video-poster-seek';

describe('25 percent video poster seek', () => {
  it('uses exactly one quarter of a valid duration, including short clips', () => {
    expect(videoPosterSeekSeconds(120000)).toBe(30);
    expect(videoPosterSeekSeconds(400)).toBe(0.1);
    expect(videoPosterSeekSeconds(36000000)).toBe(9000);
  });
  it('uses the first frame when duration is missing, invalid or zero', () => {
    for (const value of [null, undefined, 0, -1, NaN, Infinity]) expect(videoPosterSeekSeconds(value)).toBe(0);
  });
});
