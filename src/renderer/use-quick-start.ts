import { useEffect, useState } from "react";

export const QUICK_START_KEY = "superApi.quick-start.v1";
export type QuickStartState = { status: "pending" | "active" | "done"; step: number };

export function readQuickStart(): QuickStartState {
  try {
    const raw = localStorage.getItem(QUICK_START_KEY);
    if (raw) {
      const value = JSON.parse(raw) as QuickStartState;
      if (["active", "done"].includes(value.status) && Number.isInteger(value.step)
        && value.step >= 0 && value.step <= 3) return value;
    }
  } catch { /* A missing/unavailable preference must not prevent startup. */ }
  return { status: "pending", step: 0 };
}

export function useQuickStart(input: {
  ready: boolean;
  hasLibrary: boolean;
  recentReady: boolean;
  hasRecent: boolean;
}) {
  const [state, setState] = useState(readQuickStart);
  if (input.ready && (input.hasLibrary || input.recentReady)) {
    const nextState = ((current: QuickStartState): QuickStartState => {
      // Existing users can replay from Settings; upgrades never interrupt them.
      if (current.status === "pending") return {
        status: input.hasLibrary || input.hasRecent ? "done" : "active",
        step: 0,
      };
      if (current.status !== "active") return current;
      if (!input.hasLibrary && current.step > 0) return { ...current, step: 0 };
      if (input.hasLibrary && current.step === 0) return { ...current, step: 1 };
      return current;
    })(state);
    if (nextState !== state) setState(nextState);
  }
  useEffect(() => {
    if (state.status === "pending") return;
    try { localStorage.setItem(QUICK_START_KEY, JSON.stringify(state)); }
    catch { /* In-memory progress still works if storage is unavailable. */ }
  }, [state]);
  return {
    ...state,
    active: state.status === "active",
    start: () => setState({ status: "active", step: input.hasLibrary ? 1 : 0 }),
    finish: () => setState(current => ({ ...current, status: "done" })),
    next: () => setState(current => ({ ...current, step: Math.min(3, current.step + 1) })),
    back: () => setState(current => ({ ...current, step: Math.max(input.hasLibrary ? 1 : 0, current.step - 1) })),
  };
}
