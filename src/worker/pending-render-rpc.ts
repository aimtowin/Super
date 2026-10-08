import { randomUUID } from 'node:crypto';

/** Local render registry; wire payloads are validated by the Worker entry. */
export function createPendingRenderRpc<Result>(ports: {
  dispatch: (message: unknown) => void;
  abortMessage: string;
  requestId?: () => string;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}) {
  const setTimer = ports.setTimer ?? setTimeout;
  const clearTimer = ports.clearTimer ?? clearTimeout;
  let disposed = false;
  const pending = new Map<string, {
    resolve: (result: Result) => void;
    reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout> | undefined;
    cleanup: () => void;
  }>();
  const take = (requestId: string) => {
    const entry = pending.get(requestId);
    if (!entry) return undefined;
    pending.delete(requestId);
    clearTimer(entry.timer);
    entry.cleanup();
    return entry;
  };
  const abortError = (reason = ports.abortMessage) => new DOMException(reason, 'AbortError');
  return {
    request(input: {
      buildMessage: (requestId: string) => unknown;
      timeoutMs: number;
      timeoutResult: Result;
      signal?: AbortSignal;
    }): Promise<Result> {
      if (disposed || input.signal?.aborted) return Promise.reject(abortError());
      const requestId = (ports.requestId ?? randomUUID)();
      return new Promise((resolve, reject) => {
        const onAbort = (): void => {
          take(requestId)?.reject(abortError());
        };
        const entry = {
          resolve, reject, timer: undefined as ReturnType<typeof setTimeout> | undefined,
          cleanup: () => input.signal?.removeEventListener('abort', onAbort),
        };
        // Register before dispatch: a port can deliver a reply synchronously.
        pending.set(requestId, entry);
        try {
          entry.timer = setTimer(() => take(requestId)?.resolve(input.timeoutResult), input.timeoutMs);
          entry.timer.unref?.();
          input.signal?.addEventListener('abort', onAbort, { once: true });
          // Close the check/subscribe gap, including a synchronously aborted port.
          if (input.signal?.aborted) { onAbort(); return; }
          const message = input.buildMessage(requestId);
          if (pending.has(requestId)) ports.dispatch(message);
        } catch (error) {
          take(requestId)?.reject(error);
        }
      });
    },
    settle(requestId: string, result: Result): boolean {
      const entry = take(requestId);
      if (!entry) return false;
      entry.resolve(result);
      return true;
    },
    dispose(reason = ports.abortMessage): void {
      disposed = true;
      for (const requestId of pending.keys()) take(requestId)?.reject(abortError(reason));
    },
  };
}
