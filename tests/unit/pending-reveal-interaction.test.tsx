// @vitest-environment happy-dom
import { act, createElement, useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { AssetSummary } from '../../src/shared/asset-types';
import { cancelPendingAssetReveal, type PendingAssetReveal } from '../../src/renderer/pending-asset-reveal';
import { PENDING_REVEAL_SETTLE_MS, usePendingAssetReveal } from '../../src/renderer/use-pending-asset-reveal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('a deliberate asset interaction cancels delayed import selection and focus', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const assets = [{ assetId: 'a' }, { assetId: 'b' }] as AssetSummary[];
  function Harness() {
    const pendingRevealRef = useRef<PendingAssetReveal | null>({ assetIds: ['a', 'b'], focusAssetId: 'a' });
    const pendingRestoredFocusRef = useRef<string | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [primary, setPrimary] = useState<string>();
    const anchor = useRef<string | null>(null);
    const setAnchor = useCallback((id: string | null) => { anchor.current = id; }, []);
    usePendingAssetReveal({ pendingRevealRef, pendingRestoredFocusRef, assets,
      setSelectedAssetIds: setSelected, setSelectedAssetId: setPrimary,
      setAssetSelectionAnchor: setAnchor });
    return createElement('button', { onClick: () => {
      cancelPendingAssetReveal({ pendingRevealRef, pendingRestoredFocusRef });
      setSelected(['b']); setPrimary('b');
    } }, `${selected.join(',')}|${primary}|${pendingRestoredFocusRef.current ?? '-'}`);
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    expect(host.textContent).toBe('a,b|a|a');
    await act(async () => host.querySelector('button')!.click());
    await act(async () => { vi.advanceTimersByTime(PENDING_REVEAL_SETTLE_MS + 1); });
    expect(host.textContent).toBe('b|b|-');
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.useRealTimers();
  }
});
