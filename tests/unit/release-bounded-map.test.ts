import { describe, expect, it } from 'vitest';

import { mapBounded } from '../../scripts/release/bounded-map.mjs';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

describe('bounded release file work', () => {
  it('caps in-flight work and preserves input order even when completion order differs', async () => {
    const gates = [deferred<number>(), deferred<number>(), deferred<number>(), deferred<number>(), deferred<number>()] as const;
    const started: number[] = [];
    const work = mapBounded([0, 1, 2, 3, 4], 2, (_value, index) => {
      started.push(index);
      const gate = gates[index];
      if (!gate) throw new Error('Unexpected batch index.');
      return gate.promise;
    });
    expect(started).toEqual([0, 1]);
    gates[1].resolve(11);
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    gates[2].resolve(12);
    gates[0].resolve(10);
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    gates[4].resolve(14);
    gates[3].resolve(13);
    await expect(work).resolves.toEqual([10, 11, 12, 13, 14]);
  });

  it('stops dispatching after failure and drains running tasks before rejecting', async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    const started: number[] = [];
    const failure = new Error('file changed');
    let finished = false;
    const work = mapBounded([0, 1, 2, 3], 2, (_value, index) => {
      started.push(index);
      return index === 0 ? first.promise : second.promise;
    });
    const observed = work.then(() => { finished = true; }, (error) => { finished = true; return error; });
    first.reject(failure);
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(finished).toBe(false);
    second.resolve(1);
    expect(await observed).toBe(failure);
    expect(started).toEqual([0, 1]);
  });

  it('handles a thrown undefined value as a real failure', async () => {
    await expect(mapBounded([1, 2], 1, () => { throw undefined; })).rejects.toBeUndefined();
  });

  it('drains multiple in-flight failures and propagates the first observed error', async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    const firstError = new Error('first failure');
    const secondError = new Error('second failure');
    const work = mapBounded([0, 1, 2], 2, (_value, index) => index === 0 ? first.promise : second.promise);
    const observed = work.catch((error: unknown) => error);
    first.reject(firstError);
    await Promise.resolve();
    second.reject(secondError);
    expect(await observed).toBe(firstError);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 9])('rejects unsafe concurrency %s even for an empty batch', async (width) => {
    await expect(mapBounded([], width, () => 1)).rejects.toThrow(/concurrency/iu);
  });

  it('handles empty input without calling the mapper', async () => {
    let called = false;
    await expect(mapBounded([], 4, () => { called = true; return 1; })).resolves.toEqual([]);
    expect(called).toBe(false);
  });

  it('uses only the available number of workers for a small batch', async () => {
    await expect(mapBounded(['a', 'b'], 8, (value, index) => `${value}${index}`)).resolves.toEqual(['a0', 'b1']);
  });
});
