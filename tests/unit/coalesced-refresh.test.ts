import { describe, expect, it, vi } from 'vitest';
import { createCoalescedRefresh } from '../../src/renderer/coalesced-refresh';

describe('coalesced history refresh', () => {
  it('reduces 11,345 notifications during a blocked read to one trailing read', async () => {
    let finish!: () => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    const controller = createCoalescedRefresh(read);
    const first = controller.refresh();
    await Promise.resolve();
    for (let i = 0; i < 11345; i++) expect(controller.refresh()).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('drops trailing work on library change/disposal', async () => {
    let finish!: () => void;
    const read = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const controller = createCoalescedRefresh(read);
    const task = controller.refresh();
    await Promise.resolve();
    void controller.refresh();
    controller.dispose();
    finish();
    await task;
    await controller.refresh();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not retry a rejected read forever and permits a later refresh', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(undefined);
    const controller = createCoalescedRefresh(read);
    await expect(controller.refresh()).rejects.toThrow('timeout');
    await controller.refresh();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('retains one trailing notification when the active read fails', async () => {
    let reject!: (error: Error) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }))
      .mockResolvedValue(undefined);
    const controller = createCoalescedRefresh(read);
    const task = controller.refresh();
    await Promise.resolve();
    for (let i = 0; i < 100; i++) expect(controller.refresh()).toBe(task);
    reject(new Error('Worker restart'));
    await task;
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('reports a failed trailing read without unbounded retries', async () => {
    let reject!: (error: Error) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }))
      .mockRejectedValue(new Error('still unavailable'));
    const controller = createCoalescedRefresh(read);
    const task = controller.refresh();
    await Promise.resolve();
    void controller.refresh();
    reject(new Error('Worker restart'));
    await expect(task).rejects.toThrow('still unavailable');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
