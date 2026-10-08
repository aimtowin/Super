import { describe, expect, it, vi } from 'vitest';

import { PluginInstallOperation } from '../../src/main/plugin-install-operation';
import type { PluginInstallProgress } from '../../src/shared/plugin-install-progress';

describe('PluginInstallOperation', () => {
  it('reports download progress and pauses until resumed', async () => {
    const events: Array<{ state: string; bytesDownloaded: number; phase: string }> = [];
    const operation = new PluginInstallOperation('install-1', (event) => {
      events.push({ state: event.state, bytesDownloaded: event.bytesDownloaded, phase: event.phase });
    });
    const options = operation.downloadOptions();
    options.onProgress?.({ bytesDownloaded: 12, totalBytes: 100 });
    operation.control('pause');
    let resumed = false;
    const waiting = operation.waitIfPaused().then(() => { resumed = true; });
    await Promise.resolve();
    expect(resumed).toBe(false);
    operation.control('resume');
    await waiting;
    expect(resumed).toBe(true);
    expect(events).toContainEqual({ state: 'paused', bytesDownloaded: 12, phase: 'downloading' });
    expect(events.at(-1)).toMatchObject({ state: 'running', bytesDownloaded: 12 });
  });

  it('aborts and wakes a paused download when stopped', async () => {
    const report = vi.fn();
    const operation = new PluginInstallOperation('install-2', report);
    operation.control('pause');
    const waiting = operation.waitIfPaused();
    operation.control('stop');
    await expect(waiting).rejects.toThrow('stopped');
    expect(operation.signal.aborted).toBe(true);
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({
      operationId: 'install-2',
      state: 'stopped',
    }));
  });

  it.each(['resume', 'stop'] as const)('wakes every concurrent paused waiter on %s', async (action) => {
    const operation = new PluginInstallOperation('concurrent-waiters', vi.fn());
    operation.control('pause');
    const settled: string[] = [];
    const waiting = [0, 1, 2].map((index) => operation.waitIfPaused().then(
      () => { settled.push(`resolved-${index}`); },
      () => { settled.push(`rejected-${index}`); },
    ));
    operation.control(action);
    // Bounded microtask observation: the pre-fix single resume slot must fail
    // here, not hang the test runner waiting for an overwritten waiter.
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
    expect(settled.sort()).toEqual([0, 1, 2].map((index) => `${action === 'resume' ? 'resolved' : 'rejected'}-${index}`));
    await Promise.all(waiting);
  });

  it.each(['completed', 'failed', 'stopped'] as const)('reports the %s terminal state only once and ignores late callbacks', (terminal) => {
    const report = vi.fn<(event: PluginInstallProgress) => void>();
    const operation = new PluginInstallOperation('terminal-once', report);
    const options = operation.downloadOptions();
    if (terminal === 'completed') operation.setCompleted();
    else if (terminal === 'failed') operation.setFailed('fixture failure');
    else operation.control('stop');
    const afterTerminal = report.mock.calls.length;

    operation.setCompleted();
    operation.setFailed('late failure');
    operation.setPhase('installing');
    options.onProgress?.({ bytesDownloaded: 123 });
    operation.control('pause');
    operation.control('resume');
    operation.control('stop');

    expect(report.mock.calls).toHaveLength(afterTerminal);
    expect(report.mock.calls.filter(([event]) => ['completed', 'failed', 'stopped'].includes(event.state))).toHaveLength(1);
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ state: terminal }));
  });
});
