import { useCallback, useEffect, useRef, useState } from "react";
import { isNearViewerEdge, useViewerPreferences } from './viewer-preferences';

import {
  createViewerChromeIdleScheduler,
  shouldWakeViewerChrome,
  type ViewerChromeActivitySource,
} from "./viewer-chrome-idle";

const DEFAULT_IDLE_MS = 2_000;

/**
 * Fade viewer chrome after input idle (Super-627 / Super-njoy).
 *
 * Callers own the hook instance across asset navigation: mount this once at
 * a component that does not remount when the viewed asset changes (e.g. the
 * asset preview modal is remounted per-asset via a `key`, so this hook must
 * live one level up). Opening the viewer calls `wake()`; while `active`,
 * capture listeners implement the selected proximity/idle mode; keyboard and
 * focused controls remain reachable regardless of pointer position.
 */
export function useViewerChromeIdle(
  idleMs = DEFAULT_IDLE_MS,
  active = false,
): {
  idle: boolean;
  onActivity: (source: ViewerChromeActivitySource) => void;
  wake: () => void;
} {
  const [idle, setIdle] = useState(false);
  const { chromeMode } = useViewerPreferences();
  const nearChromeRef = useRef(false);
  const schedulerRef = useRef<ReturnType<
    typeof createViewerChromeIdleScheduler
  > | null>(null);

  useEffect(() => {
    const scheduler = createViewerChromeIdleScheduler(
      idleMs,
      () => {
        if (chromeMode === 'proximity' && nearChromeRef.current) scheduler.bump();
        else setIdle(true);
      },
      () => setIdle(false),
    );
    schedulerRef.current = scheduler;
    scheduler.bump();
    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [idleMs, chromeMode]);

  const wake = useCallback(() => {
    schedulerRef.current?.bump();
  }, []);

  const onActivity = useCallback(
    (source: ViewerChromeActivitySource) => {
      if (chromeMode === 'proximity' && (source === 'pointermove' || source === 'wheel') && !nearChromeRef.current) return;
      if (!shouldWakeViewerChrome(source)) return;
      wake();
    },
    [chromeMode, wake],
  );

  // Hidden chrome has pointer-events:none; use its geometry too, so approaching
  // a toolbar not exactly on the outer edge still reveals it.
  useEffect(() => {
    if (!active) return;

    const onKey = () => onActivity("keyboard");
    const onPointerMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const viewer = target?.closest('.workspace-viewer') ?? document.querySelector('.workspace-viewer');
      nearChromeRef.current = Boolean(viewer && (
        target?.closest('.preview-chrome-fade') || isNearViewerEdge(event.clientX, event.clientY, viewer.getBoundingClientRect()) ||
        [...viewer.querySelectorAll('.preview-chrome-fade')].some(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && event.clientX >= rect.left - 20 && event.clientX <= rect.right + 20 &&
            event.clientY >= rect.top - 20 && event.clientY <= rect.bottom + 20;
        })
      ));
      onActivity("pointermove");
    };
    const onPointerDown = () => onActivity("pointerdownOrClick");
    const onWheel = () => onActivity("wheel");

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });

    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("wheel", onWheel, true);
    };
  }, [active, onActivity]);

  return { idle: chromeMode === 'always' ? false : idle, onActivity, wake };
}
