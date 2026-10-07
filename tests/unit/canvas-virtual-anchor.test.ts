// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { publishCanvasAssetLayout } from '../../src/renderer/canvas-asset-layout';
import { scheduleAnchorRestore } from '../../src/renderer/canvas-reflow-restore';

describe('virtual canvas anchor restoration', () => {
  it('restores an unmounted anchor from the published geometry after a large zoom reflow', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const canvas = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = 'justified-rows';
    canvas.append(grid);
    Object.defineProperties(canvas, {
      scrollWidth: { value: 800 }, clientWidth: { value: 800 },
      scrollHeight: { value: 10000 }, clientHeight: { value: 600 },
    });
    vi.spyOn(grid, 'getBoundingClientRect').mockImplementation(() => ({
      left: 20, top: 30 - canvas.scrollTop, width: 800, height: 9900,
    }) as DOMRect);
    publishCanvasAssetLayout(grid, [{ id: 'offscreen', x: 0, y: 3000, width: 200, height: 200 }]);
    const restored = vi.fn();
    try {
      scheduleAnchorRestore(canvas, { assetId: 'offscreen', ratioX: 0.5, ratioY: 0.5, clientX: 120, clientY: 300 }, { current: null }, 1, restored, { left: 0, top: 500 });
      while (frames.length) frames.shift()!(0);
      expect(canvas.scrollTop).toBe(2830);
      expect(restored).toHaveBeenCalledTimes(1);
      expect(canvas.querySelectorAll('[data-asset-id]')).toHaveLength(0);
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
  });
});
