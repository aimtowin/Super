export interface AiQueueBatchResult {
  processed: number;
  requeued: number;
}

interface AiQueueSchedulerOptions {
  batchSize: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  retryJitterRatio?: number;
  random?: () => number;
}

interface QueueState {
  running: boolean;
  requested: boolean;
  retryRound: number;
  timer?: ReturnType<typeof setTimeout>;
}

export class AiQueueScheduler {
  private readonly stateByLibrary = new Map<string, QueueState>();
  private options: AiQueueSchedulerOptions;
  private paused = false;

  constructor(
    private readonly processBatch: (libraryId: string, maxJobs: number) => Promise<AiQueueBatchResult>,
    options: AiQueueSchedulerOptions,
  ) {
    this.options = { ...options };
  }

  setRetryPolicy(policy: {
    retryBaseDelayMs: number;
    retryMaxDelayMs: number;
    retryJitterRatio: number;
  }): void {
    this.options = {
      ...this.options,
      baseRetryDelayMs: policy.retryBaseDelayMs,
      maxRetryDelayMs: policy.retryMaxDelayMs,
      retryJitterRatio: policy.retryJitterRatio,
    };
  }

  /** Keep durable AI jobs queued while the app is in tray standby. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      for (const state of this.stateByLibrary.values()) {
        if (state.timer) {
          clearTimeout(state.timer);
          // A retry timer represents durable work that must be re-triggered
          // after foregrounding; clearing it without this marker loses it.
          state.requested = true;
        }
        state.timer = undefined;
      }
      return;
    }
    for (const [libraryId, state] of this.stateByLibrary) {
      if (state.requested) void this.trigger(libraryId);
    }
  }

  async trigger(libraryId: string): Promise<void> {
    const state = this.stateByLibrary.get(libraryId) ?? { running: false, requested: false, retryRound: 0 };
    this.stateByLibrary.set(libraryId, state);
    if (this.paused) {
      state.requested = true;
      return;
    }
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    if (state.running) {
      state.requested = true;
      return;
    }

    state.running = true;
    try {
      for (;;) {
        if (this.paused) {
          state.requested = true;
          return;
        }
        state.requested = false;
        const result = await this.processBatch(libraryId, this.options.batchSize);
        if (this.paused) {
          state.requested = true;
          return;
        }
        if (result.requeued > 0) {
          const baseDelay = Math.min(
            this.options.baseRetryDelayMs * (2 ** state.retryRound),
            this.options.maxRetryDelayMs,
          );
          const jitter = baseDelay * (this.options.retryJitterRatio ?? 0);
          const random = this.options.random ?? Math.random;
          const delay = Math.max(
            0,
            Math.round(baseDelay + ((random() * 2) - 1) * jitter),
          );
          state.retryRound = Math.min(state.retryRound + 1, 30);
          state.timer = setTimeout(() => {
            state.timer = undefined;
            void this.trigger(libraryId);
          }, delay);
          state.timer.unref?.();
          return;
        }
        state.retryRound = 0;
        if (result.processed < this.options.batchSize && !state.requested) return;
      }
    } finally {
      state.running = false;
    }
  }

  clearAll(): void {
    for (const state of this.stateByLibrary.values()) {
      if (state.timer) clearTimeout(state.timer);
    }
    this.stateByLibrary.clear();
  }
}
