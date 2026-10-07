/** One read in flight; the next period starts only after it settles. */
export function createSerialPoll(read: () => Promise<void>, intervalMs: number) {
  let period = intervalMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    clearTimer();
    if (disposed) return;
    timer = setTimeout(() => { void refresh(); }, period);
  };
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (active) return active;
    clearTimer();
    active = Promise.resolve()
      .then(() => { if (!disposed) return read(); })
      // Polling is best-effort. A transient failure must not stop later reads
      // or leave an unhandled rejection from the timer callback.
      .catch(() => undefined)
      .finally(() => {
        active = undefined;
        schedule();
      });
    return active;
  }
  return {
    refresh,
    setIntervalMs(value: number): void {
      period = value;
      if (!active && !disposed) schedule();
    },
    dispose(): void {
      disposed = true;
      clearTimer();
    },
  };
}
