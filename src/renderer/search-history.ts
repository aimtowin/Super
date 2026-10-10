export const SEARCH_HISTORY_LIMIT = 20;
export function addSearchHistory(history: readonly string[], query: string): string[] {
  const value = query.trim();
  if (!value || value.length > 512 || [...value].some(character => character.codePointAt(0)! < 32)) return [...history];
  return [value,...history.filter(item => item !== value)].slice(0,SEARCH_HISTORY_LIMIT);
}
export function loadSearchHistory(storage: Pick<Storage,'getItem'>, libraryId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem('super.search-history.v1.' + libraryId) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.length <= 512 && !!item.trim()).slice(0,SEARCH_HISTORY_LIMIT) : [];
  } catch { return []; }
}
