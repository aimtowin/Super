import {
  isPresetRangeSelected,
  type RangeStrings,
} from "./filter-presets";

// ---------------------------------------------------------------------------
// FilterPresetChips (REQ-FILTER-009 / REQ-FILTER-010 / Super-gp4)
//
// One-tap dimension presets. A chip is active when its range is among the
// selected ranges; the parent applies togglePresetRanges (Shift = OR).
// ---------------------------------------------------------------------------

export function FilterPresetChips({
  label,
  presets,
  selected,
  onToggle,
  disabled,
  excluding = false,
}: {
  label: string;
  presets: readonly { label: string; range: RangeStrings }[];
  /** Selected numeric ranges (OR within the dimension). */
  selected: readonly RangeStrings[];
  onToggle: (range: RangeStrings, shiftKey: boolean) => void;
  disabled?: boolean;
  excluding?: boolean;
}) {
  return (
    <div aria-label={label} className={`filter-presets${excluding ? " is-excluding" : ""}`} role="group">
      {presets.map((preset) => {
        const active = isPresetRangeSelected(selected, preset.range);
        return (
          <button
            aria-pressed={active}
            className={`filter-preset-chip${active ? " is-active" : ""}`}
            disabled={disabled}
            key={preset.label}
            onClick={(event) => onToggle(preset.range, event.shiftKey)}
            type="button"
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
