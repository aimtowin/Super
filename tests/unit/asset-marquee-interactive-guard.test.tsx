// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useAssetSelection } from '../../src/renderer/useAssetSelection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
describe('actual marquee interactive ownership', () => {
  it('ignores controls and clears marquee styling after a click-sized blank gesture', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host), canvas = createRef<HTMLDivElement>(), box = createRef<HTMLDivElement>();
    const cleared = vi.fn();
    function Harness() {
      const selection = useAssetSelection({ assets: [], selectedAssetIds: [], setSelectedAssetIds: vi.fn(), setSelectedAssetId: vi.fn(),
        previewAsset: null, draggedMemberId: null, draggedCollectionId: null, workspaceCanvasRef: canvas, marqueeBoxRef: box,
        marqueeLayoutKey: 'empty', onSelectionCleared: cleared });
      return createElement('div', { ref: canvas, onMouseDown: selection.handleCanvasMouseDown },
        createElement('div', { ref: box }), createElement('button', null, 'Control'),
        createElement('div', { className: 'tag-management' }, 'Tag'));
    }
    try {
      await act(async () => root.render(createElement(Harness)));
      for (const target of [host.querySelector('button')!, host.querySelector('.tag-management')!]) {
        await act(async () => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
        expect(document.body.classList.contains('is-marquee-active')).toBe(false);
      }
      await act(async () => canvas.current!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 })));
      expect(document.body.classList.contains('is-marquee-active')).toBe(true);
      await act(async () => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 10, clientY: 10 })));
      expect(document.body.classList.contains('is-marquee-active')).toBe(false);
      expect(cleared).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); host.remove(); document.body.classList.remove('is-marquee-active'); }
  });
});
