import { expect, test } from "vitest";

import {
  filterClauseSchema,
  MAX_FORMAT_FILTER_VALUES,
  MAX_OTHER_CATEGORICAL_FILTER_VALUES,
} from "../../src/shared/asset-types";
import {
  FORMAT_FILTER_GROUPS,
  FORMAT_TEXT_TOKEN,
  OTHER_FORMAT_EXTENSIONS,
} from "../../src/renderer/format-filter-presets";

const values = (count: number) =>
  Array.from({ length: count }, (_, index) => `format-${index + 1}`);

test("format filters accept the full bounded product surface", () => {
  const allExposedFormatTokens = [
    ...FORMAT_FILTER_GROUPS.flatMap((group) => group.extensions),
    ...OTHER_FORMAT_EXTENSIONS,
    FORMAT_TEXT_TOKEN,
  ];
  expect(allExposedFormatTokens.length).toBeLessThanOrEqual(
    MAX_FORMAT_FILTER_VALUES,
  );
  expect(
    filterClauseSchema.safeParse({
      field: "format",
      values: allExposedFormatTokens,
      exclude: false,
    }).success,
  ).toBe(true);
});

test("format filters still reject payloads above their bounded cap", () => {
  expect(
    filterClauseSchema.safeParse({
      field: "format",
      values: values(MAX_FORMAT_FILTER_VALUES + 1),
      exclude: false,
    }).success,
  ).toBe(false);
});

test("non-format categorical filters retain their smaller safety cap", () => {
  expect(
    filterClauseSchema.safeParse({
      field: "tag",
      values: values(MAX_OTHER_CATEGORICAL_FILTER_VALUES + 1),
      exclude: false,
    }).success,
  ).toBe(false);
});
