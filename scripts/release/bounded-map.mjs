/**
 * Limit open files/streams, preserve ordering and fail without leaving work in
 * flight. No retries, memoization or cancellation of a partially read file.
 */
export async function mapBounded(values, concurrency, mapper) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new RangeError('Release file concurrency must be an integer from 1 to 8.');
  }
  const results = new Array(values.length);
  let cursor = 0;
  let failed = false;
  let failure;
  async function worker() {
    while (!failed && cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = await mapper(values[index], index);
      } catch (error) {
        if (!failed) { failed = true; failure = error; }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  if (failed) throw failure;
  return results;
}
