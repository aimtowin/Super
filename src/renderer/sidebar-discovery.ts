export type SidebarSort = 'manual' | 'name-asc' | 'name-desc';

/** Include ancestors of matching rows, without modifying persisted collapse state. */
export function matchingTreeIds<T>(rows: readonly T[], query: string, id: (row: T) => string, parent: (row: T) => string | null, name: (row: T) => string): Set<string> {
  const needle = query.trim().normalize('NFKC').toLocaleLowerCase();
  const byId = new Map(rows.map(row => [id(row), row]));
  const result = new Set<string>();
  for (const row of rows) {
    if (needle && !name(row).normalize('NFKC').toLocaleLowerCase().includes(needle)) continue;
    let current: T | undefined = row;
    const visited = new Set<string>();
    while (current && !visited.has(id(current))) {
      const key = id(current);
      visited.add(key); result.add(key);
      current = byId.get(parent(current) ?? '');
    }
  }
  return result;
}

export function sortSidebarSiblings<T>(rows: readonly T[], sort: SidebarSort, name: (row: T) => string): T[] {
  return sort === 'manual' ? [...rows] : [...rows].sort((a, b) => name(a).localeCompare(name(b), undefined, { numeric: true, sensitivity: 'base' }) * (sort === 'name-asc' ? 1 : -1));
}

export function orderSidebarTree<T>(rows: readonly T[], sort: SidebarSort, id: (row: T) => string, parent: (row: T) => string | null, name: (row: T) => string): T[] {
  if (sort === 'manual') return [...rows];
  const children = new Map<string | null, T[]>();
  const ids = new Set(rows.map(id));
  for (const row of rows) {
    const key = ids.has(parent(row) ?? '') ? parent(row) : null;
    const bucket = children.get(key);
    if (bucket) bucket.push(row); else children.set(key, [row]);
  }
  const result: T[] = [], visited = new Set<string>();
  const visit = (row: T) => { if (visited.has(id(row))) return; visited.add(id(row)); result.push(row); for (const child of sortSidebarSiblings(children.get(id(row)) ?? [], sort, name)) visit(child); };
  for (const row of sortSidebarSiblings(children.get(null) ?? [], sort, name)) visit(row);
  // Keep corrupt/orphan rows reachable rather than silently hiding them.
  for (const row of rows) visit(row);
  return result;
}

export function parseTagNames(raw: string): string[] {
  return [...new Set(raw.split(/[,，]/u).map(name => name.trim().normalize('NFC')).filter(Boolean))].slice(0, 32);
}
