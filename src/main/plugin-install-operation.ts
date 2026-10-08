import {
  type PluginInstallControlAction,
  type PluginInstallProgress,
} from '../shared/plugin-install-progress';
import type { PluginGitHubDownloadOptions } from './plugin-package-manager-types';

export class PluginInstallCancelledError extends Error {
  constructor() {
    super('Plugin installation was stopped.');
    this.name = 'PluginInstallCancelledError';
  }
}

export class PluginInstallOperation {
  readonly operationId: string;
  readonly #abortController = new AbortController();
  readonly #report: (event: PluginInstallProgress) => void;
  #phase: PluginInstallProgress['phase'] = 'resolving';
  #state: PluginInstallProgress['state'] = 'running';
  #bytesDownloaded = 0;
  #totalBytes: number | undefined;
  #stopped = false;
  readonly #pausedWaiters = new Set<() => void>();
  readonly #pauseListeners = new Set<(paused: boolean) => void>();

  constructor(operationId: string, report: (event: PluginInstallProgress) => void) {
    this.operationId = operationId;
    this.#report = report;
    this.#emit();
  }

  get signal(): AbortSignal {
    return this.#abortController.signal;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  setPhase(phase: PluginInstallProgress['phase']): void {
    if (this.#terminal()) return;
    this.#phase = phase;
    this.#emit();
  }

  setCompleted(): void {
    this.#finish('completed');
  }

  setFailed(message: string): void {
    this.#finish('failed', message.slice(0, 2_000));
  }

  control(action: PluginInstallControlAction): void {
    if (this.#terminal()) return;
    if (action === 'pause') {
      if (this.#state === 'paused') return;
      this.#state = 'paused';
      this.#notifyPause();
      this.#emit();
      return;
    }
    if (action === 'resume') {
      this.#state = 'running';
      this.#wakePausedWaiters();
      this.#notifyPause();
      this.#emit();
      return;
    }
    this.#finish('stopped', 'Plugin installation was stopped.');
  }

  async waitIfPaused(): Promise<void> {
    if (this.signal.aborted) throw new PluginInstallCancelledError();
    if (this.#state !== 'paused') return;
    let waiter: (() => void) | undefined;
    try {
      await new Promise<void>((resolve) => {
        waiter = resolve;
        this.#pausedWaiters.add(resolve);
      });
    } finally { if (waiter !== undefined) this.#pausedWaiters.delete(waiter); }
    if (this.signal.aborted) throw new PluginInstallCancelledError();
  }

  downloadOptions(): PluginGitHubDownloadOptions {
    return {
      signal: this.signal,
      waitIfPaused: () => this.waitIfPaused(),
      subscribePause: (listener) => {
        if (!this.#terminal()) this.#pauseListeners.add(listener);
        listener(this.#state === 'paused');
        return () => { this.#pauseListeners.delete(listener); };
      },
      onPhase: (phase) => this.setPhase(phase),
      onProgress: ({ bytesDownloaded, totalBytes }) => {
        if (this.#terminal()) return;
        this.#phase = 'downloading';
        this.#bytesDownloaded = bytesDownloaded;
        this.#totalBytes = totalBytes;
        this.#emit();
      },
    };
  }

  #terminal(): boolean {
    return this.#state === 'completed' || this.#state === 'failed' || this.#state === 'stopped';
  }

  #wakePausedWaiters(): void {
    for (const resume of this.#pausedWaiters) resume();
    this.#pausedWaiters.clear();
  }

  #notifyPause(): void {
    for (const listener of this.#pauseListeners) listener(this.#state === 'paused');
  }

  #finish(state: 'completed' | 'failed' | 'stopped', message?: string): void {
    if (this.#terminal()) return;
    this.#state = state;
    this.#stopped = state === 'stopped';
    if (state !== 'completed') this.#abortController.abort();
    this.#wakePausedWaiters();
    this.#notifyPause();
    this.#pauseListeners.clear();
    this.#emit(message === undefined ? {} : { message });
  }

  #emit(extra: Pick<PluginInstallProgress, 'message'> = {}): void {
    this.#report({
      operationId: this.operationId,
      phase: this.#phase,
      state: this.#state,
      bytesDownloaded: this.#bytesDownloaded,
      ...(this.#totalBytes === undefined ? {} : { totalBytes: this.#totalBytes }),
      ...extra,
    });
  }
}
