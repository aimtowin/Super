import path from 'node:path';
import { z } from 'zod';

import { readAtomicJsonFile, writeAtomicJsonFile } from './atomic-json-file';
import type { WindowStatePreferences } from '../shared/window-state';

const WINDOW_STATE_FILE = 'window-state.json';
const WINDOW_STATE_VERSION = 1;
const MIN_WINDOW_WIDTH = 1040;
const MIN_WINDOW_HEIGHT = 680;
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 80;

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoredWindowPlacement {
  bounds: WindowBounds;
  maximized: boolean;
  fullscreen: boolean;
}

export interface WindowPlacementSource {
  getNormalBounds(): WindowBounds;
  isMaximized(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
}

const boundsSchema = z.strictObject({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const windowStateSchema = z.strictObject({
  version: z.literal(WINDOW_STATE_VERSION),
  rememberWindowState: z.boolean(),
  bounds: boundsSchema.optional(),
  maximized: z.boolean().optional(),
  fullscreen: z.boolean().optional(),
});

type WindowStateSnapshot = z.infer<typeof windowStateSchema>;

const DEFAULT_STATE: WindowStateSnapshot = {
  version: WINDOW_STATE_VERSION,
  rememberWindowState: true,
};

function validBounds(bounds: WindowBounds): boolean {
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0
    && bounds.height > 0;
}

/**
 * Keep a saved placement only when enough of the window remains inside a
 * current display. Display removal, DPI changes and monitor rearranges must
 * fall back to the default placement instead of opening off-screen.
 */
export function resolveStoredWindowBounds(
  bounds: WindowBounds,
  displays: readonly DisplayWorkArea[],
  limits: { minWidth: number; minHeight: number } = {
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
  },
): WindowBounds | undefined {
  if (!validBounds(bounds) || displays.length === 0) return undefined;
  const width = Math.max(limits.minWidth, Math.round(bounds.width));
  const height = Math.max(limits.minHeight, Math.round(bounds.height));
  const x = Math.round(bounds.x);
  const y = Math.round(bounds.y);
  const visible = displays.some((display) => {
    const horizontal = Math.min(x + width, display.x + display.width) - Math.max(x, display.x);
    const vertical = Math.min(y + height, display.y + display.height) - Math.max(y, display.y);
    return horizontal >= MIN_VISIBLE_WIDTH && vertical >= MIN_VISIBLE_HEIGHT;
  });
  if (!visible) return undefined;
  return { x, y, width, height };
}

/**
 * Main-owned persistence for the main window placement and the opt-out
 * preference. Writes are synchronous atomic JSON so a close/quit cannot lose
 * the last placement; failures are reported to the caller's logger and never
 * block closing the window.
 */
export class WindowStateStore {
  readonly #filePath: string;
  #state: WindowStateSnapshot;
  #onError: ((error: unknown) => void) | undefined;

  constructor(
    userDataDirectory: string,
    onError?: (error: unknown) => void,
  ) {
    this.#filePath = path.join(userDataDirectory, WINDOW_STATE_FILE);
    this.#onError = onError;
    this.#state = this.#load();
  }

  get filePath(): string {
    return this.#filePath;
  }

  get preferences(): WindowStatePreferences {
    return { rememberWindowState: this.#state.rememberWindowState };
  }

  setRememberWindowState(rememberWindowState: boolean): WindowStatePreferences {
    this.#state = {
      ...this.#state,
      rememberWindowState,
    };
    this.#persist();
    return this.preferences;
  }

  /** Returns the saved placement only while the preference is enabled. */
  readPlacement(displays: readonly DisplayWorkArea[]): StoredWindowPlacement | undefined {
    if (!this.#state.rememberWindowState || this.#state.bounds === undefined) return undefined;
    const bounds = resolveStoredWindowBounds(this.#state.bounds, displays);
    if (bounds === undefined) return undefined;
    return {
      bounds,
      maximized: this.#state.maximized === true,
      fullscreen: this.#state.fullscreen === true,
    };
  }

  /**
   * Record the normal (pre-maximize/fullscreen) bounds so toggling either
   * presentation state later still has a useful restore target. Minimized is
   * transient and is not written; fullscreen IS remembered now because users
   * expect a fullscreen window to reopen fullscreen.
   */
  recordPlacement(window: WindowPlacementSource): boolean {
    if (window.isMinimized()) return false;
    const bounds = window.getNormalBounds();
    if (!validBounds(bounds)) return false;
    this.#state = {
      version: WINDOW_STATE_VERSION,
      rememberWindowState: this.#state.rememberWindowState,
      bounds: {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      },
      maximized: window.isMaximized(),
      fullscreen: window.isFullScreen(),
    };
    return this.#persist();
  }

  #load(): WindowStateSnapshot {
    try {
      const raw = readAtomicJsonFile(this.#filePath);
      if (raw === undefined) return { ...DEFAULT_STATE };
      const parsed = windowStateSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : { ...DEFAULT_STATE };
    } catch (error) {
      this.#onError?.(error);
      return { ...DEFAULT_STATE };
    }
  }

  #persist(): boolean {
    try {
      writeAtomicJsonFile(this.#filePath, `${JSON.stringify(this.#state, null, 2)}\n`);
      return true;
    } catch (error) {
      this.#onError?.(error);
      return false;
    }
  }
}