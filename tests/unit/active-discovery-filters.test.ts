import { describe, expect, it } from "vitest";

import {
  buildActiveFilterChips,
  type DiscoveryFilterSnapshot,
} from "../../src/renderer/active-discovery-filters";

const empty: DiscoveryFilterSnapshot = {
  colorFilter: "",
  excludeColorFilter: false,
  formatFilter: "",
  excludeFormatFilter: false,
  tagFilter: "",
  excludeTagFilter: false,
  ratingFilter: "",
  excludeRatingFilter: false,
  favoriteFilter: "any",
  sourceUrlFilter: "any",
  availabilityFilter: "any",
  excludeAvailabilityFilter: false,
  widthRange: { min: "", max: "", exclude: false },
  heightRange: { min: "", max: "", exclude: false },
  aspectRatioRange: { min: "", max: "", exclude: false },
  longEdgeRange: { min: "", max: "", exclude: false },
  durationRange: { min: "", max: "", exclude: false },
};

describe("buildActiveFilterChips", () => {
  it("returns no chips when discovery filters are idle", () => {
    expect(buildActiveFilterChips(empty)).toEqual([]);
  });

  it("lists tag, format, rating, and aspect chips with details", () => {
    const chips = buildActiveFilterChips({
      ...empty,
      formatFilter: "png, jpg",
      excludeFormatFilter: true,
      tagFilter: "hero",
      ratingFilter: "4, 5",
      aspectRatioRange: { min: "1.52", max: "1.68", exclude: false },
      favoriteFilter: "yes",
    });
    expect(chips.map((chip) => chip.id)).toEqual([
      "format",
      "tag",
      "rating",
      "favorite",
      "aspect_ratio",
    ]);
    expect(chips[0]?.detail).toBe("png, jpg");
    expect(chips[0]?.excluding).toBe(true);
    expect(chips[4]?.detail).toBe("1.52–1.68");
  });

  it("localizes the unified text format token in chip detail", () => {
    const chips = buildActiveFilterChips(
      { ...empty, formatFilter: "text" },
      { textFormatLabel: "文本" },
    );
    expect(chips).toEqual([
      {
        id: "format",
        labelKey: "filter.formatField",
        detail: "文本",
        excluding: false,
      },
    ]);
  });

  it("keeps exclusion semantic and separate from values in every negatable dimension", () => {
    const range = { min: "10", max: "20", exclude: true };
    const chips = buildActiveFilterChips({
      ...empty,
      colorFilter: "red", excludeColorFilter: true,
      formatFilter: "png", excludeFormatFilter: true,
      tagFilter: "-hero", excludeTagFilter: true,
      ratingFilter: "0", excludeRatingFilter: true,
      availabilityFilter: "missing", excludeAvailabilityFilter: true,
      aspectRatioRange: range, aspectRatioRanges: [{ min: "1", max: "2" }, { min: "3", max: "4" }],
      longEdgeRange: range, widthRange: range, heightRange: range, durationRange: range,
    });
    expect(chips).toHaveLength(10);
    expect(chips.every((chip) => chip.excluding)).toBe(true);
    expect(chips.find((chip) => chip.id === "tag")?.detail).toBe("-hero");
    expect(chips.find((chip) => chip.id === "aspect_ratio")?.detail).toBe("1–2 ∨ 3–4");
    expect(chips.find((chip) => chip.id === "availability")?.detail).toBeUndefined();
  });

  it("does not activate exclusion flags with no matching values", () => {
    expect(buildActiveFilterChips({ ...empty,
      excludeFormatFilter: true, excludeAvailabilityFilter: true,
      widthRange: { min: "", max: "", exclude: true },
    })).toEqual([]);
  });

  it("exposes localizable actual AI status labels", () => {
    expect(buildActiveFilterChips({ ...empty, analysisStatusFilter: "analyzed" }))
      .toEqual([{ id: "analysis_status", labelKey: "filter.analyzed" }]);
    expect(buildActiveFilterChips({ ...empty, analysisStatusFilter: "unanalyzed" }))
      .toEqual([{ id: "analysis_status", labelKey: "filter.unanalyzed" }]);
  });
});
