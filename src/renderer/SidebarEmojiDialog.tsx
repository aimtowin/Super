import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icons";
import { useT } from "./i18n";
import { DialogShell } from "./ui/patterns";
import { useDialogFocusTrap } from "./use-dialog-focus-trap";
import { normalizeEmoji } from "./sidebar-emoji-preferences";
import { SIDEBAR_APPEARANCE_COLORS, SIDEBAR_EMOJI_GROUPS, SIDEBAR_ICON_GROUPS, type SidebarAppearanceColor } from "./sidebar-appearance-catalog";
import type { SidebarAppearance } from "./sidebar-appearance-preferences";
import "./sidebar-emoji.css";

export function SidebarEmojiDialog({ name, initialAppearance, defaultIcon, onSave, onClose, returnFocus }: {
  name: string;
  initialAppearance?: SidebarAppearance;
  defaultIcon: IconName;
  onSave: (appearance: SidebarAppearance | null) => void;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const t = useT();
  const [mode, setMode] = useState<"emoji" | "icon">(initialAppearance?.glyph?.kind ?? "emoji");
  const [value, setValue] = useState(initialAppearance?.glyph?.kind === "emoji" ? initialAppearance.glyph.value : "");
  const [icon, setIcon] = useState<IconName | null>(initialAppearance?.glyph?.kind === "icon" ? initialAppearance.glyph.value : null);
  const [color, setColor] = useState<SidebarAppearanceColor | null>(initialAppearance?.color ?? null);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = normalizeEmoji(value);
  const invalid = mode === "emoji" && !!value && !normalized;
  const draft: SidebarAppearance = {
    glyph: mode === "emoji" ? normalized ? { kind: "emoji", value: normalized } : null : icon ? { kind: "icon", value: icon } : null,
    color,
  };
  const groups = mode === "emoji" ? SIDEBAR_EMOJI_GROUPS : SIDEBAR_ICON_GROUPS;
  const query = search.trim().toLocaleLowerCase();
  const visibleGroups = groups.filter(group => category === "all" || group.id === category).map(group => ({
    ...group, items: group.items.filter(item => !query || item.toLocaleLowerCase().includes(query) || t(group.labelKey).toLocaleLowerCase().includes(query)),
  })).filter(group => group.items.length);
  useDialogFocusTrap(true);
  useEffect(() => {
    inputRef.current?.focus();
    return () => { if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [returnFocus]);
  const save = (appearance: SidebarAppearance | null) => {
    try { onSave(appearance); onClose(); } catch { setError(true); }
  };
  return createPortal(
    <div className="dialog-backdrop sidebar-emoji-backdrop" onKeyDown={event => {
      if (event.key !== "Tab") event.stopPropagation();
    }}>
      <DialogShell className="create-dialog sidebar-emoji-dialog" dialogId="sidebar-emoji"
        title={t("sidebarEmoji.title")} onRequestClose={onClose}>
        <form onSubmit={event => { event.preventDefault(); if (!invalid) save(draft.glyph || draft.color ? draft : null); }}>
          <div className="sidebar-emoji-preview">
            <span className="sidebar-emoji-preview-icon" aria-hidden="true">
              {draft.glyph?.kind === "emoji" ? draft.glyph.value : <Icon name={draft.glyph?.kind === "icon" ? draft.glyph.value : defaultIcon} size={26} color={color ? SIDEBAR_APPEARANCE_COLORS[color] : undefined} />}
            </span><span className="sidebar-emoji-name">{name}</span>
          </div>
          <label className="field-label" htmlFor="sidebar-emoji-input">{t("sidebarEmoji.input")}</label>
          <input ref={inputRef} id="sidebar-emoji-input" className="text-field" value={value} maxLength={64}
            autoComplete="off" spellCheck={false} aria-describedby="sidebar-emoji-help sidebar-emoji-message"
            aria-invalid={invalid} onChange={event => { setValue(event.target.value); setMode("emoji"); setCategory("all"); setError(false); }} />
          <p className="field-help" id="sidebar-emoji-help">{t("sidebarEmoji.help")}</p>
          <div className="sidebar-appearance-modes" role="group" aria-label={t("sidebarEmoji.style")}>
            {(["emoji", "icon"] as const).map(kind => <button key={kind} type="button" className="secondary-button" aria-pressed={mode === kind}
              onClick={() => { setMode(kind); setCategory("all"); setSearch(""); }}>{t("sidebarEmoji." + kind)}</button>)}
          </div>
          <div className="sidebar-appearance-filter">
            <label className="sidebar-appearance-field" htmlFor="sidebar-appearance-category">{t("sidebarEmoji.category")}
              <select id="sidebar-appearance-category" aria-label={t("sidebarEmoji.category")} className="text-field" value={category} onChange={event => setCategory(event.target.value)}>
                <option value="all">{t("sidebarEmoji.all")}</option>
                {groups.map(group => <option key={group.id} value={group.id}>{t(group.labelKey)}</option>)}
              </select>
            </label>
            <label className="sidebar-appearance-field">{t("sidebarEmoji.search")}
              <input className="text-field" placeholder={t("sidebarEmoji.search")} value={search} onChange={event => setSearch(event.target.value)} />
            </label>
          </div>
          <div className="sidebar-appearance-results" role="group" aria-label={t("sidebarEmoji.presets")}>
            {visibleGroups.map(group => <section key={group.id}>
              <h3>{t(group.labelKey)}</h3>
              <div className="sidebar-emoji-grid">{group.items.map(item => <button key={item} type="button" className="sidebar-emoji-choice"
                aria-label={item} aria-pressed={mode === "emoji" ? normalized === item : icon === item}
                onClick={() => { if (mode === "emoji") setValue(item); else setIcon(item as IconName); setError(false); }}>
                {mode === "emoji" ? item : <Icon name={item as IconName} size={22} color={color ? SIDEBAR_APPEARANCE_COLORS[color] : undefined} />}
              </button>)}</div>
            </section>)}
            {!visibleGroups.length && <p className="field-help">{t("sidebarEmoji.noResults")}</p>}
          </div>
          <div className="sidebar-appearance-colors" role="group" aria-label={t("sidebarEmoji.color")}>
            <button type="button" className="secondary-button" aria-pressed={color === null} onClick={() => setColor(null)}>{t("sidebarEmoji.defaultColor")}</button>
            {Object.entries(SIDEBAR_APPEARANCE_COLORS).map(([id, hex]) => <button key={id} type="button" className="sidebar-appearance-swatch"
              style={{ backgroundColor: hex }} aria-label={t("sidebarEmoji.colors." + id)} aria-pressed={color === id}
              onClick={() => setColor(id as SidebarAppearanceColor)} />)}
          </div>
          <p className="field-help">{t("sidebarEmoji.colorHelp")}</p>
          <p id="sidebar-emoji-message" className="sidebar-emoji-error" role="status">{error ? t("sidebarEmoji.saveError") : invalid ? t("sidebarEmoji.invalid") : ""}</p>
          <div className="dialog-actions sidebar-emoji-actions">
            <button className="secondary-button" type="button" onClick={() => save(null)}>{t("sidebarEmoji.reset")}</button>
            <button className="secondary-button" type="button" onClick={onClose}>{t("sidebarEmoji.cancel")}</button>
            <button className="primary-button" type="submit" disabled={invalid}>{t("sidebarEmoji.save")}</button>
          </div>
        </form>
      </DialogShell>
    </div>, document.body,
  );
}
