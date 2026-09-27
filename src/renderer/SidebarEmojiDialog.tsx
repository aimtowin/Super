import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icons";
import { useT } from "./i18n";
import { DialogShell } from "./ui/patterns";
import { useDialogFocusTrap } from "./use-dialog-focus-trap";
import { normalizeEmoji } from "./sidebar-emoji-preferences";
import "./sidebar-emoji.css";

export const SIDEBAR_EMOJI_PRESETS = [
  "📁", "📂", "🗂️", "📚", "📦", "⭐", "❤️", "🔥",
  "🎨", "🖼️", "📷", "🎬", "🎵", "🎮", "🧩", "💡",
  "💼", "📝", "📌", "🔖", "🌈", "🌿", "🌸", "🐱",
  "🚀", "🏠", "🌍", "💎", "🤖", "🔍", "✅", "🎯",
] as const;

export function SidebarEmojiDialog({ name, initialEmoji, defaultIcon, onSave, onClose, returnFocus }: {
  name: string;
  initialEmoji?: string;
  defaultIcon: IconName;
  onSave: (emoji: string | null) => void;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const t = useT();
  const [value, setValue] = useState(initialEmoji ?? "");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = normalizeEmoji(value);
  useDialogFocusTrap(true);
  useEffect(() => {
    inputRef.current?.focus();
    return () => { if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [returnFocus]);
  const save = (emoji: string | null) => {
    try {
      onSave(emoji);
      onClose();
    } catch { setError(true); }
  };
  return createPortal(
    <div className="dialog-backdrop sidebar-emoji-backdrop" onKeyDown={event => {
      // Keep navigation/asset shortcuts out of this local modal. Tab still
      // reaches the shared document-level focus trap.
      if (event.key !== "Tab") event.stopPropagation();
    }}>
      <DialogShell className="create-dialog sidebar-emoji-dialog" dialogId="sidebar-emoji"
        title={t("sidebarEmoji.title")} onRequestClose={onClose}>
        <form onSubmit={event => { event.preventDefault(); if (normalized) save(normalized); }}>
          <div className="sidebar-emoji-preview">
            <span className="sidebar-emoji-preview-icon" aria-hidden="true">
              {normalized ?? <Icon name={defaultIcon} size={26} />}
            </span>
            <span className="sidebar-emoji-name">{name}</span>
          </div>
          <label className="field-label" htmlFor="sidebar-emoji-input">{t("sidebarEmoji.input")}</label>
          <input ref={inputRef} id="sidebar-emoji-input" className="text-field" value={value} maxLength={64}
            autoComplete="off" spellCheck={false} aria-describedby="sidebar-emoji-help sidebar-emoji-message"
            aria-invalid={!!value && !normalized}
            onChange={event => { setValue(event.target.value); setError(false); }} />
          <p className="field-help" id="sidebar-emoji-help">{t("sidebarEmoji.help")}</p>
          <div className="sidebar-emoji-grid" role="group" aria-label={t("sidebarEmoji.presets")}>
            {SIDEBAR_EMOJI_PRESETS.map(emoji => <button key={emoji} type="button" className="sidebar-emoji-choice"
              aria-label={emoji} aria-pressed={normalized === emoji}
              onClick={() => { setValue(emoji); setError(false); }}>{emoji}</button>)}
          </div>
          <p id="sidebar-emoji-message" className="sidebar-emoji-error" role="status">
            {error ? t("sidebarEmoji.saveError") : value && !normalized ? t("sidebarEmoji.invalid") : ""}
          </p>
          <div className="dialog-actions sidebar-emoji-actions">
            <button className="secondary-button" type="button" onClick={() => save(null)}>{t("sidebarEmoji.reset")}</button>
            <button className="secondary-button" type="button" onClick={onClose}>{t("sidebarEmoji.cancel")}</button>
            <button className="primary-button" type="submit" disabled={!normalized}>{t("sidebarEmoji.save")}</button>
          </div>
        </form>
      </DialogShell>
    </div>, document.body,
  );
}
