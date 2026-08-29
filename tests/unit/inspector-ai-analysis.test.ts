import { describe, expect, it } from "vitest";

import { shouldShowInspectorAiAnalysis } from "../../src/renderer/inspector-ai-analysis";

const availableImage = {
  availability: "available" as const,
  deletedAt: null,
  mediaType: "image" as const,
};

describe("Inspector manual AI analysis action", () => {
  it("shows only for a loaded, unanalysed, available single image", () => {
    expect(shouldShowInspectorAiAnalysis({
      selectedAsset: availableImage,
      selectionCount: 1,
      aiContentLoaded: true,
      hasAiContent: false,
      canAnalyze: true,
    })).toBe(true);
  });

  it("waits for the existing AI content check before exposing the action", () => {
    expect(shouldShowInspectorAiAnalysis({
      selectedAsset: availableImage,
      selectionCount: 1,
      aiContentLoaded: false,
      hasAiContent: false,
      canAnalyze: true,
    })).toBe(false);
  });

  it("hides for analysed, non-image, unavailable, deleted, or multi-selected assets", () => {
    const base = {
      selectedAsset: availableImage,
      selectionCount: 1,
      aiContentLoaded: true,
      hasAiContent: false,
      canAnalyze: true,
    };
    expect(shouldShowInspectorAiAnalysis({ ...base, hasAiContent: true })).toBe(false);
    expect(shouldShowInspectorAiAnalysis({
      ...base,
      selectedAsset: { ...availableImage, mediaType: "video" },
    })).toBe(false);
    expect(shouldShowInspectorAiAnalysis({
      ...base,
      selectedAsset: { ...availableImage, availability: "missing" },
    })).toBe(false);
    expect(shouldShowInspectorAiAnalysis({
      ...base,
      selectedAsset: { ...availableImage, deletedAt: "2026-08-29T00:00:00.000Z" },
    })).toBe(false);
    expect(shouldShowInspectorAiAnalysis({ ...base, selectionCount: 2 })).toBe(false);
  });
});
