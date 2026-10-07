/** One active read plus one trailing read, regardless of notification burst size. */
export function createCoalescedRefresh(read: () => Promise<void>) {
  let active: Promise<void> | undefined;
  let dirty = false;
  let disposed = false;
  return {
    refresh(): Promise<void> {
      if (disposed) return Promise.resolve();
      dirty = true;
      if (active) return active;
      active = Promise.resolve().then(async () => {
        try {
          while (dirty && !disposed) {
            dirty = false;
            try {
              await read();
            } catch (error) {
              // A newer notification received during a failed read still
              // deserves its trailing reconciliation. Never retry a failure
              // without new work, and stop immediately on disposal.
              if (!dirty || disposed) throw error;
            }
          }
        } finally {
          active = undefined;
        }
      });
      return active;
    },
    dispose(): void { disposed = true; dirty = false; },
  };
}
