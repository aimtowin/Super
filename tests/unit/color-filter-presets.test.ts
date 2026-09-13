import { describe, expect, it } from "vitest";

import {
  COLOR_PRESETS,
  colorFilterSql,
  parseColorFilterIds,
} from "../../src/shared/color-filter-presets";

describe("color-filter-presets", () => {
  it("parses known ids including black/white and drops unknown tokens", () => {
    expect(parseColorFilterIds("red, black, white, nope")).toEqual([
      "red",
      "black",
      "white",
    ]);
  });

  it("covers the full hue circle without gaps between hue neighbors", () => {
    const covered = new Array(360).fill(false);
    for (const preset of COLOR_PRESETS) {
      if (preset.kind !== "hue") continue;
      for (const span of preset.hues) {
        for (let hue = span.min; hue < span.max; hue += 1) {
          covered[hue] = true;
        }
      }
    }
    expect(covered.every(Boolean)).toBe(true);
  });

  it('provides a palette-grade hue catalogue plus black, gray, and white', () => {
    expect(COLOR_PRESETS.filter((preset) => preset.kind === 'hue')).toHaveLength(18);
    expect(COLOR_PRESETS.map((preset) => preset.id)).toEqual(expect.arrayContaining([
      'scarlet', 'amber', 'chartreuse', 'teal', 'sky', 'indigo', 'magenta', 'gray',
    ]));
  });

  it("builds inclusive match SQL and null-safe exclude SQL for hues", () => {
    const match = colorFilterSql("h", ["blue"], false);
    expect(match?.sql).toContain("IS NOT NULL");
    expect(match?.params).toEqual([230, 250]);

    const exclude = colorFilterSql("h", ["red"], true);
    expect(exclude?.sql).toContain("NOT");
    expect(exclude?.params).toEqual([350, 360, 0, 10]);
  });

  it("matches black/white via lightness column", () => {
    const match = colorFilterSql("h", ["black", "white"], false, "L");
    expect(match?.sql).toContain("L");
    expect(match?.params).toEqual([0, 0.18, 0.82, 1.01]);
  });
});
