import { useId } from "react";
import { useT } from "./i18n";

/** Native radios provide arrow-key navigation and announce the actual mode. */
export function FilterModeControl({ label, excluding, onChange, disabled = false }: {
  label: string;
  excluding: boolean;
  onChange: (excluding: boolean) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const groupId = useId();
  return (
    <div className={`filter-mode-control${excluding ? " is-excluding" : ""}`} role="radiogroup" aria-label={t("filter.modeForDimension", { label })}>
      {[false, true].map((exclude) => (
        <label className="filter-mode-option" key={String(exclude)}>
          <input
            checked={excluding === exclude}
            disabled={disabled}
            name={groupId}
            onChange={() => onChange(exclude)}
            type="radio"
            value={exclude ? "exclude" : "include"}
          />
          <span>{t(exclude ? "filter.exclude" : "filter.include")}</span>
        </label>
      ))}
    </div>
  );
}

export function FilterPanelHeader({ label, excluding, active, disabled, onChange, multiSelect = true }: {
  label: string;
  excluding: boolean;
  active: boolean;
  disabled: boolean;
  onChange: (excluding: boolean) => void;
  multiSelect?: boolean;
}) {
  const t = useT();
  return (
    <div className="dimension-filter-header">
      <div className="dimension-filter-heading">
        <span className="dimension-filter-title">{label}</span>
        <FilterModeControl label={label} excluding={excluding} disabled={disabled || !active} onChange={onChange} />
      </div>
      <p className="dimension-filter-mode-hint">{t(!active ? "filter.chooseConditionFirst" : excluding ? "filter.excludeHint" : "filter.includeHint")}</p>
      {multiSelect && <p className="dimension-filter-hint">{t("filter.shiftMultiSelectHint")}</p>}
    </div>
  );
}
