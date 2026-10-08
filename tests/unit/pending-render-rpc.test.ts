import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPendingRenderRpc } from '../../src/worker/pending-render-rpc';

afterEach(() => vi.useRealTimers());

describe('pending render RPC lifecycle', () => {
  it('does not dispatch or allocate a timer for a pre-aborted request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const dispatch = vi.fn();
    const rpc = createPendingRenderRpc<string>({ dispatch, abortMessage: 'cancelled', requestId: () => 'r' });
    const result = rpc.request({ buildMessage: () => ({}), timeoutMs: 10, timeoutResult: 'timeout', signal: controller.signal });
    const outcome = result.then((value) => value, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['success', 'timeout'])('removes the abort listener on %s', async (terminal) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const rpc = createPendingRenderRpc<string>({ dispatch: vi.fn(), abortMessage: 'cancelled', requestId: () => 'r' });
    const result = rpc.request({ buildMessage: () => ({}), timeoutMs: 10, timeoutResult: 'timeout', signal: controller.signal });
    if (terminal === 'success') rpc.settle('r', 'ok');
    else await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe(terminal === 'success' ? 'ok' : 'timeout');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(rpc.settle('r', 'late')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['build', 'dispatch'])('cleans the registry when %s throws', async (phase) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const fail = () => { throw new Error('post failure'); };
    const rpc = createPendingRenderRpc<string>({ dispatch: phase === 'dispatch' ? fail : vi.fn(), abortMessage: 'cancelled', requestId: () => 'r' });
    await expect(rpc.request({
      buildMessage: phase === 'build' ? fail : () => ({}), timeoutMs: 10,
      timeoutResult: 'timeout', signal: controller.signal,
    })).rejects.toThrow('post failure');
    expect(rpc.settle('r', 'late')).toBe(false);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles synchronous replies and ignores duplicate or late replies', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const rpc = createPendingRenderRpc<string>({ dispatch: () => { rpc.settle('r', 'ok'); }, abortMessage: 'cancelled', requestId: () => 'r' });
    await expect(rpc.request({ buildMessage: () => ({}), timeoutMs: 10, timeoutResult: 'timeout', signal: controller.signal })).resolves.toBe('ok');
    controller.abort(); rpc.dispose();
    expect(rpc.settle('r', 'duplicate')).toBe(false);
    expect(remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans a live abort exactly once without a later timeout or reply', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const rpc = createPendingRenderRpc<string>({ dispatch: vi.fn(), abortMessage: 'cancelled', requestId: () => 'r' });
    const pending = rpc.request({ buildMessage: () => ({}), timeoutMs: 10, timeoutResult: 'timeout', signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    await vi.advanceTimersByTimeAsync(20);
    expect(rpc.settle('r', 'late')).toBe(false);
    expect(remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes all live requests once and rejects new work without posting', async () => {
    vi.useFakeTimers();
    let sequence = 0;
    const dispatch = vi.fn();
    const rpc = createPendingRenderRpc<string>({ dispatch, abortMessage: 'cancelled', requestId: () => String(++sequence) });
    const controllers = [new AbortController(), new AbortController()];
    const removed = controllers.map((controller) => vi.spyOn(controller.signal, 'removeEventListener'));
    const results = controllers.map((controller) => rpc.request({ buildMessage: () => ({}), timeoutMs: 10, timeoutResult: 'timeout', signal: controller.signal }).catch((error: unknown) => error));
    rpc.dispose('shutdown'); rpc.dispose('shutdown');
    for (const result of results) expect(await result).toMatchObject({ name: 'AbortError', message: 'shutdown' });
    await expect(rpc.request({ buildMessage: () => ({}), timeoutMs: 10, timeoutResult: 'timeout' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(dispatch).toHaveBeenCalledTimes(2);
    removed.forEach((remove) => expect(remove).toHaveBeenCalledOnce());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles abort during subscription and message construction without posting', async () => {
    vi.useFakeTimers();
    for (const phase of ['subscribe', 'build']) {
      const controller = new AbortController();
      if (phase === 'subscribe') {
        const add = controller.signal.addEventListener.bind(controller.signal);
        vi.spyOn(controller.signal, 'addEventListener').mockImplementation((...args) => { add(...args); controller.abort(); });
      }
      const dispatch = vi.fn();
      const rpc = createPendingRenderRpc<string>({ dispatch, abortMessage: 'cancelled' });
      await expect(rpc.request({
        buildMessage: () => { controller.abort(); return {}; }, timeoutMs: 10,
        timeoutResult: 'timeout', signal: controller.signal,
      })).rejects.toMatchObject({ name: 'AbortError' });
      expect(dispatch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  });
});
