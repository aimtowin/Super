import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSerialPoll } from '../../src/renderer/serial-poll';

afterEach(() => vi.useRealTimers());

describe('serial task status polling', () => {
  it('drops a queued initial read when its library is disposed before the microtask', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(undefined);
    const poll = createSerialPoll(read, 1_000);
    const first = poll.refresh();
    poll.dispose();
    await first;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(read).not.toHaveBeenCalled();
  });

  it('does not overlap reads even when a read exceeds the polling period', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    const poll = createSerialPoll(read, 1_000);
    const first = poll.refresh();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(poll.refresh()).toBe(first);
    finish();
    await first;
    await vi.advanceTimersByTimeAsync(999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    poll.dispose();
  });

  it('changes panel frequency without starting a second in-flight read', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    const poll = createSerialPoll(read, 2_000);
    const first = poll.refresh();
    await Promise.resolve();
    poll.setIntervalMs(1_000);
    expect(poll.refresh()).toBe(first);
    finish();
    await first;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(read).toHaveBeenCalledTimes(2);
    poll.setIntervalMs(2_000);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    poll.dispose();
  });

  it('keeps periodic polling after a transient failure without unhandled rejection', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValueOnce(new Error('restart')).mockResolvedValue(undefined);
    const poll = createSerialPoll(read, 2_000);
    await poll.refresh();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(read).toHaveBeenCalledTimes(2);
    poll.dispose();
  });

  it('does not schedule reads after disposal, including an active read finishing', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const read = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const poll = createSerialPoll(read, 1_000);
    const first = poll.refresh();
    await Promise.resolve();
    poll.dispose();
    finish();
    await first;
    poll.setIntervalMs(2_000);
    await poll.refresh();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
