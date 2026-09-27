import { useMemo, useSyncExternalStore } from "react";
import { emojiStorageKey, readEmojiPreferences, saveEmojiPreference } from "./sidebar-emoji-preferences";

const changeEvent = "super-sidebar-emoji-change";
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}

export function useSidebarEmoji(libraryId: string | undefined) {
  const raw = useSyncExternalStore(subscribe, () => {
    try {
      return libraryId ? localStorage.getItem(emojiStorageKey(libraryId)) : null;
    } catch { return null; }
  }, () => null);
  const icons = useMemo(() => readEmojiPreferences(raw), [raw]);
  const save = (key: string, emoji: string | null) => {
    if (!libraryId) throw new Error("No library");
    saveEmojiPreference(libraryId, key, emoji, localStorage);
    window.dispatchEvent(new Event(changeEvent));
  };
  return { icons, save };
}
