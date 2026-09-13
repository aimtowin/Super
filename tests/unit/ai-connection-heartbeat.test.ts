import { describe, expect, it } from "vitest";

import {
  AI_CONNECTION_HEARTBEAT_MS,
  AI_CONNECTION_HEARTBEAT_MAX_MS,
  aiConnectionHeartbeatDelay,
  aiAnalyzeConnectionReady,
  aiAnalyzeShowsDisconnectGlyph,
  shouldRunAiConnectionHeartbeat,
} from "../../src/renderer/ai-connection-heartbeat";

describe("ai-connection-heartbeat (Super-rsbt)", () => {
  it("uses a ~60s interval", () => {
    expect(AI_CONNECTION_HEARTBEAT_MS).toBe(60_000);
  });

  it("runs heartbeat only while a stored key exists and the window is visible", () => {
    expect(shouldRunAiConnectionHeartbeat(true)).toBe(true);
    expect(shouldRunAiConnectionHeartbeat(false)).toBe(false);
    expect(shouldRunAiConnectionHeartbeat(true, true)).toBe(false);
  });

  it("backs off repeated failed probes without stopping recovery checks", () => {
    expect(aiConnectionHeartbeatDelay(0)).toBe(AI_CONNECTION_HEARTBEAT_MS);
    expect(aiConnectionHeartbeatDelay(1)).toBe(120_000);
    expect(aiConnectionHeartbeatDelay(2)).toBe(240_000);
    expect(aiConnectionHeartbeatDelay(99)).toBe(AI_CONNECTION_HEARTBEAT_MAX_MS);
  });

  it("shows the disconnect glyph when unavailable", () => {
    expect(aiAnalyzeShowsDisconnectGlyph(false, "idle")).toBe(true);
    expect(aiAnalyzeShowsDisconnectGlyph(true, "idle")).toBe(true);
    expect(aiAnalyzeShowsDisconnectGlyph(true, "disconnected")).toBe(true);
    expect(aiAnalyzeShowsDisconnectGlyph(true, "error")).toBe(true);
    expect(aiAnalyzeShowsDisconnectGlyph(true, "connecting")).toBe(false);
    expect(aiAnalyzeShowsDisconnectGlyph(true, "connected")).toBe(false);
  });

  it("requires connected state for analyze readiness", () => {
    expect(aiAnalyzeConnectionReady(true, "connected")).toBe(true);
    expect(aiAnalyzeConnectionReady(true, "connecting")).toBe(false);
    expect(aiAnalyzeConnectionReady(true, "disconnected")).toBe(false);
    expect(aiAnalyzeConnectionReady(false, "connected")).toBe(false);
  });
});
