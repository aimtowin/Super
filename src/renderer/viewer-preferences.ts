import { useSyncExternalStore } from 'react';

export type ViewerChromeMode = 'proximity' | 'idle' | 'always';
export type ViewerPreferences = { chromeMode: ViewerChromeMode; hideMissingLinked: boolean };
const key = 'super.viewer-preferences.v1';
const defaults: ViewerPreferences = { chromeMode: 'proximity', hideMissingLinked: false };
let current: ViewerPreferences = defaults;
try {
  const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<ViewerPreferences> | null;
  if (value) current = {
    chromeMode: ['proximity', 'idle', 'always'].includes(value.chromeMode ?? '') ? value.chromeMode! : defaults.chromeMode,
    hideMissingLinked: value.hideMissingLinked === true,
  };
} catch { /* Unavailable or invalid preferences use safe defaults. */ }
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function updateViewerPreferences(patch: Partial<ViewerPreferences>): void {
  current = { ...current, ...patch };
  try { localStorage.setItem(key, JSON.stringify(current)); } catch { /* Session settings still apply. */ }
  for (const listener of listeners) listener();
}
export function useViewerPreferences(): ViewerPreferences {
  return useSyncExternalStore(subscribe, () => current, () => defaults);
}

export function isNearViewerEdge(x: number, y: number, rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, margin = 64): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom &&
    Math.min(x - rect.left, rect.right - x, y - rect.top, rect.bottom - y) <= margin;
}
