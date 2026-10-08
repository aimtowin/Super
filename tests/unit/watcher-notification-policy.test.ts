import { describe, expect, it, vi } from 'vitest';

import { createCoalescedRefresh } from '../../src/renderer/coalesced-refresh';
import { nextAssetNotificationCandidate } from '../../src/renderer/watcher-notification-policy';
import type { AssetChangeEvent } from '../../src/shared/protocol/responses';

function event(changedCount: number, silent = false, libraryId = 'library'): AssetChangeEvent {
  return { type: 'asset.changed', libraryId, changedCount, missingCount: 0, source: 'watcher',
    ...(silent ? { suppressWatcherNotification: true } : {}) };
}

describe('watcher presentation candidate (no refresh/session ownership)', () => {
  it('keeps a preceding notification candidate when a silent watcher arrives last', () => {
    const visible = event(2); const silent = event(3, true);
    expect(nextAssetNotificationCandidate(visible, silent)).toBe(visible);
  });
  it('lets a visible watcher replace a preceding silent event without changing its count', () => {
    const visible = event(2);
    const noCandidate = nextAssetNotificationCandidate(undefined, event(3, true));
    expect(noCandidate).toBeUndefined();
    expect(nextAssetNotificationCandidate(noCandidate, visible)).toBe(visible);
    expect(visible.changedCount).toBe(2);
  });
  it.each(['client', 'text-save', 'content-replace', undefined] as const)('retains the original latest policy for source=%s, even with a true watcher-only hint', (source) => {
    const incoming = { ...event(5), source, suppressWatcherNotification: true };
    expect(nextAssetNotificationCandidate(event(2), incoming)).toBe(incoming);
  });
  it('does not suppress a false or omitted flag and never sums independent event counts', () => {
    const previous = event(2);
    const latest = event(5);
    expect(nextAssetNotificationCandidate(previous, latest)).toBe(latest);
    const flagFalse = { ...latest, suppressWatcherNotification: false };
    expect(nextAssetNotificationCandidate(previous, flagFalse)).toBe(flagFalse);
    expect(flagFalse.changedCount).toBe(5);
    expect(previous.changedCount).toBe(2);
  });
});

// Composition boundary: these tests exercise the production pure selector and
// production coalescer, not a mounted App or its real event/timer wiring.
describe('notification candidate composition with the existing coalescer', () => {
  it.each(['visible-first', 'silent-first'] as const)('keeps one visible candidate through an active-read burst (%s)', async (arrival) => {
    let finish!: () => void;
    const blocked = new Promise<void>((resolve) => { finish = resolve; });
    let candidate: AssetChangeEvent | undefined;
    let pendingDomain: AssetChangeEvent | undefined;
    const reads: AssetChangeEvent[] = [];
    const notices: AssetChangeEvent[] = [];
    let readCount = 0;
    const read = vi.fn(async () => {
      readCount += 1;
      const domain = pendingDomain; pendingDomain = undefined;
      const notice = candidate; candidate = undefined;
      if (domain) reads.push(domain);
      if (readCount === 1) await blocked;
      if (notice) notices.push(notice);
    });
    const reconciliation = createCoalescedRefresh(read);
    const receive = (incoming: AssetChangeEvent) => {
      pendingDomain = incoming;
      candidate = nextAssetNotificationCandidate(candidate, incoming);
      return reconciliation.refresh();
    };
    const visible = event(2); const silent = event(3, true);
    const task = receive(arrival === 'visible-first' ? visible : silent);
    expect(receive(arrival === 'visible-first' ? silent : visible)).toBe(task);
    await Promise.resolve();
    for (let index = 0; index < 100; index++) expect(receive(event(index + 1, true))).toBe(task);
    expect(read).toHaveBeenCalledOnce();
    finish(); await task;
    expect(read).toHaveBeenCalledTimes(2);
    expect(reads).toHaveLength(2);
    expect(reads[1]).toEqual(event(100, true));
    expect(notices).toEqual([visible]);
  });

  it('publishes the latest visible candidate from a trailing read without letting a final silent event erase it', async () => {
    let finish!: () => void;
    const blocked = new Promise<void>((resolve) => { finish = resolve; });
    let candidate: AssetChangeEvent | undefined;
    const notices: AssetChangeEvent[] = [];
    let readCount = 0;
    const read = vi.fn(async () => {
      readCount += 1;
      const notice = candidate; candidate = undefined;
      if (readCount === 1) await blocked;
      if (notice) notices.push(notice);
    });
    const reconciliation = createCoalescedRefresh(read);
    const receive = (incoming: AssetChangeEvent) => {
      candidate = nextAssetNotificationCandidate(candidate, incoming);
      return reconciliation.refresh();
    };
    const first = event(1); const latest = event(5);
    const task = receive(first); await Promise.resolve();
    receive(event(3)); receive(latest); receive(event(20, true));
    finish(); await task;
    expect(read).toHaveBeenCalledTimes(2);
    expect(notices).toEqual([first, latest]);
  });

  it('requires the owning scope to clear its candidate/dispose on switch, and permits independent B notifications', async () => {
    let finish!: () => void;
    const blocked = new Promise<void>((resolve) => { finish = resolve; });
    let disposed = false;
    let candidate: AssetChangeEvent | undefined = event(1, false, 'A');
    const notices: AssetChangeEvent[] = [];
    const oldRead = vi.fn(async () => {
      const notice = candidate; candidate = undefined;
      await blocked;
      if (!disposed && notice) notices.push(notice);
    });
    const old = createCoalescedRefresh(oldRead);
    const pending = old.refresh(); await Promise.resolve();
    candidate = nextAssetNotificationCandidate(candidate, event(2, false, 'A'));
    void old.refresh();
    disposed = true; candidate = undefined; old.dispose();
    const b = event(3, false, 'B');
    const next = createCoalescedRefresh(async () => {
      const notice = nextAssetNotificationCandidate(undefined, b);
      if (notice) notices.push(notice);
    });
    await next.refresh(); finish(); await pending;
    expect(oldRead).toHaveBeenCalledOnce();
    expect(notices).toEqual([b]);
  });
});
