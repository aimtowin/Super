import type { AssetMetadataResult } from "../shared/asset-types";
import type { LibraryApiResult } from "../shared/library-api";
import { createPublicError, type PublicError } from "../shared/protocol/errors";
import type { RendererLibrarySummary } from "../shared/protocol/responses";

declare const sessionBrand: unique symbol;
export type MetadataSessionOwner = {
  readonly token: symbol;
  readonly libraryId: string;
  readonly [sessionBrand]: true;
};
export type MetadataReadPriority = "primary" | "bulk";
export type MetadataReadState = {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly total: number;
  readonly ready: number;
  readonly failedAssetIds: readonly string[];
  readonly error?: PublicError;
};
export const IDLE_METADATA_READ_STATE: MetadataReadState = {
  status: "idle", total: 0, ready: 0, failedAssetIds: [],
};
type Result = LibraryApiResult<AssetMetadataResult>;
type Entry = { epoch: number; current: boolean; value?: AssetMetadataResult; failure?: PublicError };
type Observer = { ids: Set<string>; priority: MetadataReadPriority; listener: (state: MetadataReadState) => void };
type Waiter = { priority: MetadataReadPriority; resolve: (result: Result) => void; cleanup: () => void };
type Session = {
  owner: MetadataSessionOwner;
  summary: RendererLibrarySummary;
  disposed: boolean;
  entries: Map<string, Entry>;
  conflicts: Map<string, number>;
  observers: Set<Observer>;
};
type Read = {
  session: Session; assetId: string; epoch: number;
  state: "queued" | "active";
  waiters: Set<Waiter>;
};
export type MetadataMutationTicket = {
  readonly owner: MetadataSessionOwner;
  readonly epochs: ReadonlyMap<string, number>;
};

/** Renderer-local budget. A logical cancellation never releases a raw IPC slot. */
export function createMetadataReadController(readMetadata: (
  input: { libraryId: string; assetId: string },
) => Promise<Result>) {
  const sessions = new WeakMap<MetadataSessionOwner, Session>();
  const reads = new Set<Read>();
  let current: MetadataSessionOwner | null = null;
  let rawActive = 0;
  let rawBulkActive = 0;
  let pumpQueued = false;
  const notifications = new Set<Session>();
  const cancelled = (): Result => ({ ok: false, error: createPublicError("CANCELLED") });
  const isCurrent = (owner: MetadataSessionOwner | null | undefined): owner is MetadataSessionOwner =>
    owner != null && current === owner && sessions.get(owner)?.disposed === false;
  const entryFor = (session: Session, assetId: string) => {
    let entry = session.entries.get(assetId);
    if (!entry) {
      entry = { epoch: 0, current: false };
      session.entries.set(assetId, entry);
    }
    return entry;
  };
  const interested = (read: Read) => read.waiters.size > 0 ||
    [...read.session.observers].some((observer) => observer.ids.has(read.assetId));
  const priorityFor = (read: Read): MetadataReadPriority =>
    [...read.waiters].some((waiter) => waiter.priority === "primary") ||
    [...read.session.observers].some((observer) => observer.priority === "primary" && observer.ids.has(read.assetId))
      ? "primary" : "bulk";
  const finishWaiters = (read: Read, result: Result) => {
    for (const waiter of [...read.waiters]) {
      read.waiters.delete(waiter);
      waiter.cleanup();
      waiter.resolve(result);
    }
  };
  const snapshot = (owner: MetadataSessionOwner | null, assetIds: readonly string[]): MetadataReadState => {
    const ids = [...new Set(assetIds)];
    if (!isCurrent(owner) || ids.length === 0) return IDLE_METADATA_READ_STATE;
    const session = sessions.get(owner)!;
    let ready = 0;
    const failedAssetIds: string[] = [];
    let error: PublicError | undefined;
    for (const assetId of ids) {
      const entry = session.entries.get(assetId);
      if (entry?.current && entry.value) ready++;
      else if (entry?.failure) { failedAssetIds.push(assetId); error ??= entry.failure; }
    }
    return {
      status: failedAssetIds.length > 0 ? "error" : ready === ids.length ? "ready" : "loading",
      total: ids.length, ready, failedAssetIds, ...(error ? { error } : {}),
    };
  };
  const notify = (session: Session) => {
    if (session.disposed || notifications.has(session)) return;
    notifications.add(session);
    queueMicrotask(() => {
      notifications.delete(session);
      if (!isCurrent(session.owner)) return;
      for (const observer of [...session.observers]) {
        observer.listener(snapshot(session.owner, [...observer.ids]));
      }
    });
  };
  const schedulePump = () => {
    if (pumpQueued) return;
    pumpQueued = true;
    queueMicrotask(() => { pumpQueued = false; pump(); });
  };
  const ensure = (session: Session, assetId: string): Read | undefined => {
    if (!isCurrent(session.owner)) return;
    const entry = entryFor(session, assetId);
    if (entry.current || entry.failure) return;
    const shared = [...reads].find((read) => read.session === session && read.assetId === assetId && read.epoch === entry.epoch);
    if (shared) return shared;
    const read: Read = { session, assetId, epoch: entry.epoch, state: "queued", waiters: new Set() };
    reads.add(read);
    schedulePump();
    return read;
  };
  const commitRead = (read: Read, result: Result): Result => {
    const { session, assetId, epoch } = read;
    if (!isCurrent(session.owner)) return cancelled();
    const entry = entryFor(session, assetId);
    if (entry.epoch !== epoch) return cancelled();
    if (!result.ok) {
      entry.failure = result.error;
      notify(session);
      return result;
    }
    const minimum = Math.max(entry.value?.entityVersion ?? 0, session.conflicts.get(assetId) ?? 0);
    if (result.value.entityVersion < minimum) {
      const error = createPublicError("VERSION_CONFLICT", undefined, minimum);
      entry.failure = error;
      notify(session);
      return { ok: false, error };
    }
    entry.value = result.value;
    entry.current = true;
    entry.failure = undefined;
    session.conflicts.delete(assetId);
    notify(session);
    return result;
  };
  function pump() {
    for (const read of [...reads]) {
      if (read.state !== "queued") continue;
      if (!isCurrent(read.session.owner) || read.epoch !== entryFor(read.session, read.assetId).epoch || !interested(read)) {
        reads.delete(read);
        finishWaiters(read, cancelled());
      }
    }
    while (rawActive < 4) {
      const queued = [...reads].filter((read) => read.state === "queued");
      const read = queued.find((candidate) => priorityFor(candidate) === "primary") ??
        (rawBulkActive < 3 ? queued.find((candidate) => priorityFor(candidate) === "bulk") : undefined);
      if (!read) return;
      const bulk = priorityFor(read) === "bulk";
      read.state = "active";
      rawActive++;
      if (bulk) rawBulkActive++;
      let raw: Promise<Result>;
      try { raw = readMetadata({ libraryId: read.session.owner.libraryId, assetId: read.assetId }); }
      catch { raw = Promise.resolve({ ok: false, error: createPublicError("INTERNAL_ERROR") }); }
      // Only this chain owns the raw slot. No consumer cancellation, observer
      // cleanup, or session disposal is allowed to decrement these counters.
      void raw.then(
        (result) => finishWaiters(read, commitRead(read, result)),
        () => finishWaiters(read, commitRead(read, { ok: false, error: createPublicError("INTERNAL_ERROR") })),
      ).finally(() => {
        reads.delete(read);
        rawActive--;
        if (bulk) rawBulkActive--;
        schedulePump();
      });
    }
  }
  const invalidate = (owner: MetadataSessionOwner, assetIds?: readonly string[]) => {
    if (!isCurrent(owner)) return;
    const session = sessions.get(owner)!;
    const ids = assetIds ? new Set(assetIds) : new Set([
      ...session.entries.keys(), ...[...session.observers].flatMap((observer) => [...observer.ids]),
    ]);
    for (const assetId of ids) {
      const entry = entryFor(session, assetId);
      entry.epoch++;
      entry.current = false;
      entry.failure = undefined;
      for (const read of [...reads]) {
        if (read.session !== session || read.assetId !== assetId) continue;
        finishWaiters(read, cancelled());
        if (read.state === "queued") reads.delete(read);
      }
      if ([...session.observers].some((observer) => observer.ids.has(assetId))) ensure(session, assetId);
    }
    notify(session);
    schedulePump();
  };
  const disposeSession = (owner: MetadataSessionOwner | null) => {
    if (!owner) return;
    const session = sessions.get(owner);
    if (!session || session.disposed) return;
    session.disposed = true;
    session.observers.clear();
    notifications.delete(session);
    for (const read of [...reads]) {
      if (read.session !== session) continue;
      finishWaiters(read, cancelled());
      if (read.state === "queued") reads.delete(read);
    }
    session.entries.clear(); session.conflicts.clear();
    if (current === owner) current = null;
    schedulePump();
  };
  const controller = {
    isCurrent, snapshot, invalidate, disposeSession,
    invalidateAfterHistoryRestore(owner: MetadataSessionOwner): void {
      if (!isCurrent(owner)) return;
      const session = sessions.get(owner)!;
      // Successful undo/redo restores a logical snapshot version, not a
      // monotonically increasing metadata version. HistoryStatus carries no
      // affected IDs, so rebase this owner's cached read baselines conservatively.
      // Explicit conflict minimums are independent and must remain protected.
      for (const entry of session.entries.values()) entry.value = undefined;
      invalidate(owner);
    },
    getEpoch(owner: MetadataSessionOwner, assetId: string): number {
      return sessions.get(owner)?.entries.get(assetId)?.epoch ?? 0;
    },
    activateSession(summary: RendererLibrarySummary): MetadataSessionOwner {
      disposeSession(current);
      const owner = { token: Symbol("metadata-session"), libraryId: summary.libraryId } as MetadataSessionOwner;
      sessions.set(owner, { owner, summary, disposed: false, entries: new Map(), conflicts: new Map(), observers: new Set() });
      current = owner;
      return owner;
    },
    updateSessionSummary(owner: MetadataSessionOwner, summary: RendererLibrarySummary): boolean {
      if (!isCurrent(owner) || summary.libraryId !== owner.libraryId) return false;
      sessions.get(owner)!.summary = summary;
      return true;
    },
    peek(owner: MetadataSessionOwner, assetId: string): AssetMetadataResult | undefined {
      if (!isCurrent(owner)) return;
      const entry = sessions.get(owner)!.entries.get(assetId);
      return entry?.current ? entry.value : undefined;
    },
    // Only versioned writes may use the last confirmed version while a refresh
    // is pending. expectedVersion still protects the durable write; aggregate
    // and UI consumers must use peek/currentCache instead.
    lastConfirmed(owner: MetadataSessionOwner, assetId: string): AssetMetadataResult | undefined {
      return isCurrent(owner) ? sessions.get(owner)!.entries.get(assetId)?.value : undefined;
    },
    currentCache(owner: MetadataSessionOwner | null): ReadonlyMap<string, AssetMetadataResult> {
      const cache = new Map<string, AssetMetadataResult>();
      if (isCurrent(owner)) {
        for (const [assetId, entry] of sessions.get(owner)!.entries) {
          if (entry.current && entry.value) cache.set(assetId, entry.value);
        }
      }
      return cache;
    },
    conflictIds(owner: MetadataSessionOwner | null): ReadonlySet<string> {
      return new Set(isCurrent(owner) ? sessions.get(owner)!.conflicts.keys() : []);
    },
    hasConflict(owner: MetadataSessionOwner, assetId: string): boolean {
      return isCurrent(owner) && sessions.get(owner)!.conflicts.has(assetId);
    },
    markConflict(owner: MetadataSessionOwner, assetId: string, minimumVersion: number) {
      if (!isCurrent(owner)) return;
      const session = sessions.get(owner)!;
      if (!Number.isSafeInteger(minimumVersion) || minimumVersion < 0) {
        minimumVersion = (session.entries.get(assetId)?.value?.entityVersion ?? 0) + 1;
      }
      session.conflicts.set(assetId, Math.max(session.conflicts.get(assetId) ?? 0, minimumVersion));
      const entry = entryFor(session, assetId);
      entry.epoch++; entry.current = false;
      entry.failure = createPublicError("VERSION_CONFLICT", undefined, minimumVersion);
      for (const read of [...reads]) {
        if (read.session === session && read.assetId === assetId) {
          finishWaiters(read, cancelled());
          if (read.state === "queued") reads.delete(read);
        }
      }
      notify(session); schedulePump();
    },
    observe(owner: MetadataSessionOwner, assetIds: readonly string[], priority: MetadataReadPriority, listener: Observer["listener"]): () => void {
      if (!isCurrent(owner)) return () => undefined;
      const session = sessions.get(owner)!;
      const observer: Observer = { ids: new Set(assetIds), priority, listener };
      session.observers.add(observer);
      for (const assetId of observer.ids) ensure(session, assetId);
      notify(session);
      return () => { session.observers.delete(observer); schedulePump(); };
    },
    request(owner: MetadataSessionOwner, assetId: string, priority: MetadataReadPriority = "primary", signal?: AbortSignal): Promise<Result> {
      if (!isCurrent(owner) || signal?.aborted) return Promise.resolve(cancelled());
      const session = sessions.get(owner)!;
      const entry = entryFor(session, assetId);
      if (entry.current && entry.value) return Promise.resolve({ ok: true, value: entry.value });
      if (entry.failure) return Promise.resolve({ ok: false, error: entry.failure });
      const read = ensure(session, assetId)!;
      return new Promise((resolve) => {
        const onAbort = () => {
          read.waiters.delete(waiter); waiter.cleanup(); resolve(cancelled()); schedulePump();
        };
        const waiter: Waiter = { priority, resolve, cleanup: () => signal?.removeEventListener("abort", onAbort) };
        read.waiters.add(waiter);
        signal?.addEventListener("abort", onAbort, { once: true });
        schedulePump();
      });
    },
    retry(owner: MetadataSessionOwner, assetIds: readonly string[]) {
      const failed = assetIds.filter((assetId) => sessions.get(owner)?.entries.get(assetId)?.failure);
      invalidate(owner, failed);
    },
    beginMutation(owner: MetadataSessionOwner, assetIds: readonly string[]): MetadataMutationTicket {
      const session = sessions.get(owner);
      return { owner, epochs: new Map([...new Set(assetIds)].map((assetId) => [assetId, session ? entryFor(session, assetId).epoch : -1])) };
    },
    commitMutation(ticket: MetadataMutationTicket, values: readonly AssetMetadataResult[] = []): boolean {
      if (!isCurrent(ticket.owner)) return false;
      const session = sessions.get(ticket.owner)!;
      const accepted = values.filter((value) => {
        const entry = entryFor(session, value.assetId);
        return ticket.epochs.get(value.assetId) === entry.epoch && value.entityVersion >= (entry.value?.entityVersion ?? 0);
      });
      invalidate(ticket.owner, [...ticket.epochs.keys()]);
      for (const value of accepted) {
        const entry = entryFor(session, value.assetId);
        entry.value = value; entry.current = true; entry.failure = undefined;
      }
      // Queued re-reads of fully returned write values need not dispatch.
      for (const read of [...reads]) {
        if (read.session !== session || read.state !== "queued") continue;
        const value = controller.peek(ticket.owner, read.assetId);
        if (value) { reads.delete(read); finishWaiters(read, { ok: true, value }); }
      }
      notify(session); schedulePump();
      return true;
    },
    getBudget() { return { rawActive, rawBulkActive, queued: [...reads].filter((read) => read.state === "queued").length }; },
  };
  return controller;
}
export type MetadataReadController = ReturnType<typeof createMetadataReadController>;
