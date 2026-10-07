// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DimensionFilterBar, type DimensionFilterBarProps } from "../../src/renderer/DimensionFilterBar";
import type { DiscoveryFilterSnapshot } from "../../src/renderer/active-discovery-filters";
import { LocaleProvider } from "../../src/renderer/i18n";
import { TechnicalRangeFilter } from "../../src/renderer/TechnicalRangeFilter";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const empty: DiscoveryFilterSnapshot = {
  colorFilter: "", excludeColorFilter: false, formatFilter: "", excludeFormatFilter: false,
  tagFilter: "", excludeTagFilter: false, ratingFilter: "", excludeRatingFilter: false,
  favoriteFilter: "any", sourceUrlFilter: "any", availabilityFilter: "any",
  excludeAvailabilityFilter: false, analysisStatusFilter: "any",
  aspectRatioRange: { min: "", max: "", exclude: false }, aspectRatioRanges: [],
  longEdgeRange: { min: "", max: "", exclude: false },
  widthRange: { min: "", max: "", exclude: false }, heightRange: { min: "", max: "", exclude: false },
  durationRange: { min: "", max: "", exclude: false },
};
function propsFor(snapshot: DiscoveryFilterSnapshot = empty): DimensionFilterBarProps {
  return {
    ...snapshot, snapshot, tags: [], analysisStatusFilter: snapshot.analysisStatusFilter ?? "any",
    aspectRatioRanges: snapshot.aspectRatioRanges ?? [],
    setColorFilter: vi.fn(), setExcludeColorFilter: vi.fn(),
    setFormatFilter: vi.fn(), setExcludeFormatFilter: vi.fn(),
    setTagFilter: vi.fn(), setExcludeTagFilter: vi.fn(), onTagNamesChange: vi.fn(),
    setRatingFilter: vi.fn(), setExcludeRatingFilter: vi.fn(),
    setFavoriteFilter: vi.fn(), setSourceUrlFilter: vi.fn(), setAvailabilityFilter: vi.fn(),
    setExcludeAvailabilityFilter: vi.fn(), setAnalysisStatusFilter: vi.fn(),
    setAspectRatioRange: vi.fn(), setAspectRatioRanges: vi.fn(), setLongEdgeRange: vi.fn(),
    setWidthRange: vi.fn(), setHeightRange: vi.fn(), setDurationRange: vi.fn(),
    sortField: "name", sortOrder: "asc", setSortField: vi.fn(), setSortOrder: vi.fn(), onClearFilter: vi.fn(),
  };
}
let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(props: DimensionFilterBarProps, locale: "zh-CN" | "en" = "zh-CN") {
  if (!root) {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  }
  await act(async () => { root?.render(createElement(LocaleProvider, { initialPreference: locale, children:
    createElement(DimensionFilterBar, props) })); });
}
async function open(id: string) {
  await act(async () => { host?.querySelector<HTMLButtonElement>(`[data-dimension="${id}"] button`)?.focus(); });
  return document.querySelector<HTMLElement>(`.dimension-filter-popover[data-dimension="${id}"]`)!;
}
afterEach(async () => {
  await act(async () => { root?.unmount(); }); host?.remove(); root = undefined; host = undefined;
});
describe("discovery filter UI", () => {
  it("puts disabled include/exclude choices above an empty format list", async () => {
    await render(propsFor());
    const panel = await open("format");
    const header = panel.querySelector(".dimension-filter-header")!;
    expect(panel.firstElementChild).toBe(header);
    expect(header.textContent).toContain("先选择条件");
    const radios = [...header.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios).toHaveLength(2);
    expect(radios.every((radio) => radio.disabled)).toBe(true);
    expect(radios[0]!.checked).toBe(true);
  });
  it("labels excluded filters explicitly and clears only the chosen chip", async () => {
    const props = propsFor({ ...empty, formatFilter: "png, jpg", excludeFormatFilter: true });
    await render(props);
    const chip = host!.querySelector<HTMLButtonElement>(".dimension-active-chip")!;
    expect(chip.textContent).toBe("排除 格式 · png, jpg");
    expect(chip.classList.contains("is-excluding")).toBe(true);
    expect(chip.getAttribute("aria-label")).toContain("排除 格式 · png, jpg");
    await act(async () => { chip.click(); });
    expect(props.onClearFilter).toHaveBeenCalledWith("format");
    const panel = await open("format");
    expect(panel.classList.contains("is-excluding")).toBe(true);
    const include = panel.querySelector<HTMLInputElement>('input[value="include"]')!;
    await act(async () => { include.click(); });
    expect(props.setExcludeFormatFilter).toHaveBeenCalledWith(false);
  });
  it("allows excluding multiple shape presets when custom range inputs are empty", async () => {
    const props = propsFor({ ...empty, aspectRatioRanges: [{ min: "0", max: "0.99" }, { min: "1.01", max: "100" }] });
    await render(props);
    const panel = await open("shape");
    const exclude = panel.querySelector<HTMLInputElement>('input[value="exclude"]')!;
    expect(exclude.disabled).toBe(false);
    await act(async () => { exclude.click(); });
    const updater = vi.mocked(props.setAspectRatioRange).mock.calls[0]![0]!;
    expect(typeof updater === "function" ? updater(props.aspectRatioRange) : updater).toEqual({ min: "", max: "", exclude: true });
    expect(props.setAspectRatioRanges).not.toHaveBeenCalled();
  });
  it.each([
    { dimension: "color", snapshot: { ...empty, colorFilter: "red", excludeColorFilter: true }, setter: "setExcludeColorFilter" as const },
    { dimension: "tags", snapshot: { ...empty, tagFilter: "hero", excludeTagFilter: true }, setter: "setExcludeTagFilter" as const },
    { dimension: "rating", snapshot: { ...empty, ratingFilter: "0, 5", excludeRatingFilter: true }, setter: "setExcludeRatingFilter" as const },
  ])("uses the same header and explicit mode for $dimension", async ({ dimension, snapshot, setter }) => {
    const props = propsFor(snapshot);
    await render(props);
    const panel = await open(dimension);
    expect(panel.classList.contains("is-excluding")).toBe(true);
    const radios = [...panel.querySelectorAll<HTMLInputElement>('.dimension-filter-header input[type="radio"]')];
    expect(radios).toHaveLength(2);
    expect(radios[1]!.checked).toBe(true);
    await act(async () => { radios[0]!.click(); });
    expect(props[setter]).toHaveBeenCalledWith(false);
  });
  it("marks shape exclusions and only actual active exclusions in More", async () => {
    await render(propsFor({ ...empty, aspectRatioRange: { min: "1", max: "2", exclude: true },
      excludeAvailabilityFilter: true, widthRange: { min: "10", max: "", exclude: false } }));
    expect(host!.querySelector('[data-dimension="shape"] button')!.classList.contains("is-excluding")).toBe(true);
    expect(host!.querySelector('[data-dimension="more"] button')!.classList.contains("is-excluding")).toBe(false);
    await render(propsFor({ ...empty, widthRange: { min: "10", max: "", exclude: true } }));
    expect(host!.querySelector('[data-dimension="more"] button')!.classList.contains("is-excluding")).toBe(true);
  });
  it("shows actual favorite, source, availability and analysis states", async () => {
    await render(propsFor({ ...empty, favoriteFilter: "no", sourceUrlFilter: "no", availabilityFilter: "missing", analysisStatusFilter: "unanalyzed" }));
    const labels = [...host!.querySelectorAll(".dimension-active-chip")].map((chip) => chip.textContent);
    expect(labels).toContain("未喜欢"); expect(labels).toContain("无源链接");
    expect(labels).toContain("文件丢失"); expect(labels).toContain("未 AI 分析");
  });
  it("localizes excluded summaries in English", async () => {
    await render(propsFor({ ...empty, formatFilter: "png", excludeFormatFilter: true }), "en");
    expect(host!.querySelector(".dimension-active-chip")!.textContent).toBe("Exclude Format · png");
  });
  it("does not accept chip actions or open panels while interactions are locked", async () => {
    const props = { ...propsFor({ ...empty, formatFilter: "png" }), interactionsLocked: true };
    await render(props);
    expect([...host!.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled)).toBe(true);
    await open("format");
    expect(document.querySelector(".dimension-filter-popover")).toBeNull();
  });
  it("separately labels and disables range controls", async () => {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(LocaleProvider, { initialPreference: "zh-CN", children:
      createElement(TechnicalRangeFilter, { label: "长边", range: empty.longEdgeRange, setRange: vi.fn(), disabled: true }) })); });
    expect(host.querySelector("label label")).toBeNull();
    expect(host.querySelector('input[aria-label="长边最小值"]')).not.toBeNull();
    expect([...host.querySelectorAll<HTMLInputElement>("input")].every((input) => input.disabled)).toBe(true);
  });
});
