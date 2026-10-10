import { useMemo, useSyncExternalStore } from "react";
import { getSidebarAppearanceSnapshot, readSidebarAppearances, saveSidebarAppearance, type SidebarAppearance } from "./sidebar-appearance-preferences";

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
      return getSidebarAppearanceSnapshot(libraryId, localStorage);
    } catch { return "[null,null]"; }
  }, () => "[null,null]");
  const appearances = useMemo(() => {
    const [current, legacy] = JSON.parse(raw) as [string | null, string | null];
    return readSidebarAppearances(current, legacy);
  }, [raw]);
  const save = (key: string, appearance: SidebarAppearance | null) => {
    if (!libraryId) throw new Error("No library");
    saveSidebarAppearance(libraryId, key, appearance, localStorage);
    window.dispatchEvent(new Event(changeEvent));
  };
  return { appearances, save };
}
