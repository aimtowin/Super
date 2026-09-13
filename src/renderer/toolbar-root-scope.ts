/**
 * The toolbar's passive surface supports an explicit double-click shortcut to
 * the library root. Keep form controls and commands fully isolated so a
 * toolbar action (including an Electron window drag) can never unexpectedly
 * replace the active folder scope with the library root.
 */
const TOOLBAR_INTERACTIVE_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "form",
  "label",
  "a",
  "[role='button']",
  "[contenteditable='true']",
].join(", ");

type ClosestCapableTarget = EventTarget & {
  closest?: (selector: string) => Element | null;
};

/**
 * Returns true only for the non-interactive portion of the app toolbar. The
 * caller uses this exclusively from a double-click handler. This intentionally
 * includes passive breadcrumb text, which provides a deliberate path back to
 * the root without making a normal title-bar drag navigate away from the
 * current folder.
 */
export function shouldClearFolderScopeFromToolbarDoubleClick(
  target: EventTarget | null,
): boolean {
  const candidate = target as ClosestCapableTarget | null;
  return Boolean(
    candidate &&
      typeof candidate.closest === "function" &&
      candidate.closest(TOOLBAR_INTERACTIVE_SELECTOR) === null,
  );
}
