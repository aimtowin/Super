/** Stops new dispatches on failure; waits for running operations before rejecting. */
export function mapBounded<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => R | Promise<R>,
): Promise<R[]>;
