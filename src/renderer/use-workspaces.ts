import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export const MAX_WORKSPACES = 6;
export interface Workspace { id: string; name: string; values: Record<string, unknown>; scroll: {left: number; top: number}; }
export interface WorkspaceRegistry { activeId: string; items: Workspace[]; }
export function initialWorkspaces(): WorkspaceRegistry {
  return {activeId: 'main', items: [{id: 'main', name: '1', values: {}, scroll: {left: 0, top: 0}}]};
}
export function updateWorkspaceValue<T>(state: WorkspaceRegistry, key: string, action: SetStateAction<T>, fallback: T): WorkspaceRegistry {
  return {...state, items: state.items.map(item => {
    if (item.id !== state.activeId) return item;
    const before = Object.hasOwn(item.values, key) ? item.values[key] as T : fallback;
    const next = typeof action === 'function' ? (action as (value: T) => T)(before) : action;
    return Object.is(before, next) ? item : {...item, values: {...item.values, [key]: next}};
  })};
}
export function closeWorkspace(state: WorkspaceRegistry, id: string): WorkspaceRegistry {
  if (state.items.length < 2) return state;
  const index = state.items.findIndex(item => item.id === id);
  if (index < 0) return state;
  const items = state.items.filter(item => item.id !== id);
  return {items, activeId: state.activeId === id ? items[Math.max(0,index - 1)]!.id : state.activeId};
}
export function useWorkspaces() {
  const [registry, setRegistry] = useState(initialWorkspaces);
  return {registry, setRegistry};
}
export type Workspaces = ReturnType<typeof useWorkspaces>;

/** Stable dispatchers preserve the contract of App's original useState setters. */
export function useWorkspaceValue<T>(manager: Workspaces, key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
export function useWorkspaceValue<T = undefined>(manager: Workspaces, key: string): [T | undefined, Dispatch<SetStateAction<T | undefined>>];
export function useWorkspaceValue<T>(manager: Workspaces, key: string, initial?: T | (() => T)) {
  const [factory] = useState(() => ({initial}));
  const makeDefault = () => typeof factory.initial === 'function' ? (factory.initial as () => T)() : factory.initial as T;
  const id = manager.registry.activeId;
  const signature = manager.registry.items.map(item => item.id).join('|');
  const [cache, setCache] = useState(() => ({signature, defaults: new Map([[id, makeDefault()]])}));
  let defaults = cache.defaults;
  if (cache.signature !== signature || !defaults.has(id)) {
    defaults = new Map([...defaults].filter(([key]) => manager.registry.items.some(item => item.id === key)));
    if (!defaults.has(id)) defaults.set(id, makeDefault());
    setCache({signature, defaults});
  }
  const dispatchDefaults = useRef(defaults);
  useLayoutEffect(() => { dispatchDefaults.current = defaults; }, [defaults]);
  const item = manager.registry.items.find(row => row.id === id)!;
  const value = Object.hasOwn(item.values,key) ? item.values[key] as T : defaults.get(id)!;
  const setRegistry = manager.setRegistry;
  const set = useCallback((action: SetStateAction<T>) => setRegistry(state =>
    updateWorkspaceValue(state,key,action,dispatchDefaults.current.get(state.activeId)!)), [key,setRegistry]);
  return [value, set] as const;
}
