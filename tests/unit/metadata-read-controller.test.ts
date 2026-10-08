import { describe, expect, it } from "vitest";
import type { AssetMetadataResult } from "../../src/shared/asset-types";
import type { LibraryApiResult } from "../../src/shared/library-api";
import { createPublicError } from "../../src/shared/protocol/errors";
import { createMetadataReadController } from "../../src/renderer/metadata-read-controller";

type Result = LibraryApiResult<AssetMetadataResult>;
const summary = (libraryId = "same") => ({ libraryId, displayName: libraryId, displayPath: `/isolated/${libraryId}` });
function metadata(assetId: string, extra: Partial<AssetMetadataResult> = {}): AssetMetadataResult {
  return { assetId, description: null, rating: 0, favorite: false, palette: null,
    automaticPalette: [], effectivePalette: [], paletteSource: null, tags: [],
    sourcePageUrl: null, author: null, entityVersion: 7, updatedAt: "2026-10-08T00:00:00Z", ...extra };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function fixture() {
  const calls: Array<{ libraryId: string; assetId: string; settled: boolean; resolve: (result: Result) => void }> = [];
  let active = 0; let maximum = 0;
  const controller = createMetadataReadController((input) => {
    active++; maximum = Math.max(active, maximum);
    return new Promise<Result>((resolve) => {
      const call = { ...input, settled: false, resolve(result: Result) {
        if (call.settled) return;
        call.settled = true; active--; resolve(result);
      } };
      calls.push(call);
    });
  });
  return { controller, calls, get active() { return active; }, get maximum() { return maximum; } };
}

describe("metadata read controller: real raw IPC and owner/epoch contract (A5)", () => {
  it("rebases confirmed history read versions while fencing old raw replies and retaining independent conflict minimums", async () => {
    const f = fixture(); const owner = f.controller.activateSession(summary());
    const initial = f.controller.request(owner, "restored"); await flush();
    f.calls[0]!.resolve({ ok: true, value: metadata("restored", { entityVersion: 8 }) });
    await initial; await flush();
    f.controller.markConflict(owner, "unrelated-conflict", 12);
    f.controller.invalidate(owner, ["restored"]);
    const oldEpoch = f.controller.request(owner, "restored"); await flush();
    expect(f.active).toBe(1);

    f.controller.invalidateAfterHistoryRestore(owner);
    expect((await oldEpoch).ok).toBe(false);
    expect(f.controller.lastConfirmed(owner, "restored")).toBeUndefined();
    expect(f.controller.hasConflict(owner, "unrelated-conflict")).toBe(true);
    expect(f.controller.getBudget().rawActive).toBe(1);
    const fresh = f.controller.request(owner, "restored"); await flush();
    expect(f.active).toBe(2);
    f.calls[1]!.resolve({ ok: true, value: metadata("restored", { entityVersion: 9, description: "old epoch" }) });
    await flush(); expect(f.controller.peek(owner, "restored")).toBeUndefined();
    f.calls[2]!.resolve({ ok: true, value: metadata("restored", { entityVersion: 2, description: "restored" }) });
    expect((await fresh).ok).toBe(true); await flush();
    expect(f.controller.peek(owner, "restored")?.entityVersion).toBe(2);

    const conflict = f.controller.request(owner, "unrelated-conflict"); await flush();
    f.calls[3]!.resolve({ ok: true, value: metadata("unrelated-conflict", { entityVersion: 11 }) });
    const rejected = await conflict;
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toMatchObject({ code: "VERSION_CONFLICT", currentEntityVersion: 12 });
    expect(f.controller.hasConflict(owner, "unrelated-conflict")).toBe(true);

    f.controller.invalidate(owner, ["restored"]);
    const ordinary = f.controller.request(owner, "restored"); await flush();
    f.calls[4]!.resolve({ ok: true, value: metadata("restored", { entityVersion: 1 }) });
    expect((await ordinary).ok).toBe(false);
    await flush(); expect(f.controller.getBudget().rawActive).toBe(0);
  });

  it("shares consumers, lets one cancel, and retains the raw slot until settlement", async () => {
    const f = fixture(); const owner = f.controller.activateSession(summary());
    const abort = new AbortController();
    const first = f.controller.request(owner, "a", "bulk", abort.signal);
    const second = f.controller.request(owner, "a", "bulk");
    await flush(); expect(f.calls).toHaveLength(1);
    abort.abort(); expect((await first).ok).toBe(false); expect(f.active).toBe(1);
    expect(f.controller.getBudget().rawActive).toBe(1);
    f.calls[0]!.resolve({ ok: true, value: metadata("a") });
    expect((await second).ok).toBe(true); await flush();
    expect(f.controller.getBudget().rawActive).toBe(0);
  });

  it("does not dispatch when the final queued consumer cancels", async () => {
    const f = fixture(); const owner = f.controller.activateSession(summary()); const abort = new AbortController();
    const read = f.controller.request(owner, "a", "bulk", abort.signal); abort.abort();
    await flush(); expect(f.calls).toHaveLength(0); expect((await read).ok).toBe(false);
  });

  it("retains three old bulk slots and gives new primary the fourth", async () => {
    const f = fixture(); const old = f.controller.activateSession(summary("old"));
    const stop = f.controller.observe(old, ["a", "b", "c", "d"], "bulk", () => undefined);
    await flush(); expect(f.active).toBe(3);
    stop(); const next = f.controller.activateSession(summary("new"));
    const read = f.controller.request(next, "primary", "primary"); await flush();
    expect(f.active).toBe(4); expect(f.calls.at(-1)?.assetId).toBe("primary");
    expect(f.controller.getBudget().rawBulkActive).toBe(3);
    for (const call of f.calls) call.resolve({ ok: true, value: metadata(call.assetId) });
    await read; await flush(); expect(f.controller.currentCache(next).size).toBe(1);
  });

  it("does not dispatch unbounded IPC across twenty same-ID reopenings", async () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) {
      const owner = f.controller.activateSession(summary());
      f.controller.observe(owner, ["a", "b", "c", "d"], "bulk", () => undefined); await flush();
    }
    expect(f.maximum).toBe(3); expect(f.calls).toHaveLength(3);
    const owner = f.controller.activateSession(summary("last"));
    const primary = f.controller.request(owner, "last", "primary"); await flush(); expect(f.active).toBe(4);
    for (const call of f.calls) call.resolve({ ok: true, value: metadata(call.assetId) });
    await primary; await flush(); expect(f.controller.currentCache(owner).size).toBe(1);
  });

  it("prioritizes queued new primary when all four old primary slots are occupied", async () => {
    const f = fixture(); const old = f.controller.activateSession(summary("old"));
    const oldReads = ["a", "b", "c", "d"].map((id) => f.controller.request(old, id)); await flush();
    const owner = f.controller.activateSession(summary("new"));
    f.controller.observe(owner, ["bulk-a", "bulk-b"], "bulk", () => undefined);
    const primary = f.controller.request(owner, "primary"); await flush(); expect(f.calls).toHaveLength(4);
    f.calls[0]!.resolve({ ok: true, value: metadata("a") }); await flush();
    expect(f.calls[4]!.assetId).toBe("primary"); expect(f.maximum).toBe(4);
    f.controller.disposeSession(owner);
    for (const call of f.calls) call.resolve({ ok: true, value: metadata(call.assetId) });
    await Promise.all([...oldReads, primary]); await flush(); expect(f.active).toBe(0);
  });

  it("advances unchanged active interest, discards the old epoch and does not prefetch unrelated IDs", async () => {
    const f = fixture(); const owner = f.controller.activateSession(summary());
    const stop = f.controller.observe(owner, ["a", "b"], "bulk", () => undefined); await flush();
    f.controller.invalidate(owner, ["b", "uninterested"]); await flush();
    expect(f.calls.filter((call) => call.assetId === "b")).toHaveLength(2);
    expect(f.calls.some((call) => call.assetId === "uninterested")).toBe(false);
    f.calls.find((call) => call.assetId === "b")!.resolve({ ok: true, value: metadata("b", { rating: 0 }) }); await flush();
    expect(f.controller.peek(owner, "b")).toBeUndefined();
    for (const call of f.calls) call.resolve({ ok: true, value: metadata(call.assetId, { rating: 5 }) });
    await flush(); expect(f.controller.snapshot(owner, ["a", "b"]).status).toBe("ready"); stop();
  });

  it("does not retry a failed read without explicit retry and never exposes a success subset as ready", async () => {
    const f = fixture(); const owner = f.controller.activateSession(summary());
    const stop = f.controller.observe(owner, ["a", "b"], "bulk", () => undefined); await flush();
    f.calls[0]!.resolve({ ok: true, value: metadata("a") });
    f.calls[1]!.resolve({ ok: false, error: createPublicError("ASSET_NOT_FOUND") }); await flush();
    expect(f.controller.snapshot(owner, ["a", "b"])).toMatchObject({ status: "error", ready: 1, failedAssetIds: ["b"] });
    await flush(); expect(f.calls).toHaveLength(2);
    f.controller.retry(owner, ["a", "b"]); await flush(); expect(f.calls).toHaveLength(3);
    f.calls[2]!.resolve({ ok: true, value: metadata("b") }); await flush();
    expect(f.controller.snapshot(owner, ["a", "b"]).status).toBe("ready"); stop();
  });

  it("blocks pre-mutation same-version rating reads and uses current returned durable writes", async () => {
    const f = fixture(); const owner = f.controller.activateSession(summary());
    const stop = f.controller.observe(owner, ["a"], "primary", () => undefined); await flush();
    const ticket = f.controller.beginMutation(owner, ["a"]);
    f.controller.commitMutation(ticket, [metadata("a", { rating: 5 })]);
    f.calls[0]!.resolve({ ok: true, value: metadata("a", { rating: 0 }) }); await flush();
    expect(f.controller.peek(owner, "a")?.rating).toBe(5); expect(f.calls).toHaveLength(1); stop();
  });

  it("does not publish a write response captured before a newer invalidation", async () => {
    const f = fixture(); const owner = f.controller.activateSession(summary());
    const ticket = f.controller.beginMutation(owner, ["a"]);
    f.controller.invalidate(owner, ["a"]);
    f.controller.commitMutation(ticket, [metadata("a", { description: "old-save" })]);
    expect(f.controller.peek(owner, "a")).toBeUndefined();
    expect(f.calls).toHaveLength(0);
  });

  it("keeps the conflict minimum until a confirmed version reaches it", async () => {
    const f = fixture(); const owner = f.controller.activateSession(summary());
    f.controller.markConflict(owner, "a", 9); f.controller.markConflict(owner, "a", 8);
    f.controller.invalidate(owner, ["a"]); const low = f.controller.request(owner, "a"); await flush();
    f.calls[0]!.resolve({ ok: true, value: metadata("a", { entityVersion: 8 }) });
    expect((await low).ok).toBe(false); expect(f.controller.hasConflict(owner, "a")).toBe(true);
    f.controller.retry(owner, ["a"]); const confirmed = f.controller.request(owner, "a"); await flush();
    f.calls[1]!.resolve({ ok: true, value: metadata("a", { entityVersion: 9 }) });
    expect((await confirmed).ok).toBe(true); expect(f.controller.hasConflict(owner, "a")).toBe(false);
  });

  it("rename preserves owner/read while explicit same-ID activation expires it", async () => {
    const f = fixture(); const owner = f.controller.activateSession(summary()); const read = f.controller.request(owner, "a");
    expect(f.controller.updateSessionSummary(owner, { ...summary(), displayName: "renamed" })).toBe(true); await flush();
    expect(f.calls).toHaveLength(1); const replacement = f.controller.activateSession(summary());
    expect(replacement.token).not.toBe(owner.token); expect((await read).ok).toBe(false);
    expect(f.controller.updateSessionSummary(owner, summary())).toBe(false);
    f.calls[0]!.resolve({ ok: true, value: metadata("a") }); await flush();
    expect(f.controller.currentCache(replacement).size).toBe(0);
  });
});
