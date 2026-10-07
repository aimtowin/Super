import type { Dispatch, SetStateAction } from "react";

import { useT } from "./i18n";
import { FilterModeControl } from "./FilterModeControl";

export type TechnicalRangeInput = {
  min: string;
  max: string;
  exclude: boolean;
};

export function TechnicalRangeFilter({
  label,
  range,
  setRange,
  step = "1",
  disabled = false,
  showMode = true,
}: {
  label: string;
  range: TechnicalRangeInput;
  setRange: Dispatch<SetStateAction<TechnicalRangeInput>>;
  step?: string;
  disabled?: boolean;
  showMode?: boolean;
}) {
  const t = useT();
  return (
    <div className={`technical-range-filter${range.exclude ? " is-excluding" : ""}`} role="group" aria-label={label}>
      <div className="dimension-filter-heading">
        <span className="dimension-filter-title">{label}</span>
        {showMode && <FilterModeControl
          label={label}
          excluding={range.exclude}
          disabled={disabled || (!range.min.trim() && !range.max.trim())}
          onChange={(exclude) => setRange((current) => ({ ...current, exclude }))}
        />}
      </div>
      <div className="numeric-filter-range">
        <input
          aria-label={t("filter.rangeMinAria", { label })}
          className="text-field"
          disabled={disabled}
          min="0"
          onChange={(event) =>
            setRange((current) => ({ ...current, min: event.target.value }))
          }
          placeholder={t("common.min")}
          step={step}
          type="number"
          value={range.min}
        />
        <span>–</span>
        <input
          aria-label={t("filter.rangeMaxAria", { label })}
          className="text-field"
          disabled={disabled}
          min="0"
          onChange={(event) =>
            setRange((current) => ({ ...current, max: event.target.value }))
          }
          placeholder={t("common.max")}
          step={step}
          type="number"
          value={range.max}
        />
      </div>
    </div>
  );
}
