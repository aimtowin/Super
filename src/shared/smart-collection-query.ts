/**
 * CU-M5: a smart collection must encode a real discovery constraint.
 * Sort-only (or empty `{}`) definitions match every asset and are rejected.
 *
 * Accepts a structural subset so Renderer `SearchDefinition` (looser field
 * typing) and Zod `SmartCollectionQueryDefinition` can share one check.
 */
export function hasMeaningfulSmartCollectionCondition(definition: {
  search?: {
    clauses?: readonly unknown[];
    groups?: ReadonlyArray<readonly unknown[]>;
  } | null;
  filters?: readonly unknown[] | null;
  sort?: unknown;
}): boolean {
  const searchClauses = definition.search?.clauses ?? [];
  const searchGroups = definition.search?.groups ?? [];
  const filters = definition.filters ?? [];
  return (
    searchClauses.length > 0 ||
    searchGroups.some((group) => group.length > 0) ||
    filters.length > 0
  );
}

/**
 * Draft smart collections are intentionally persisted with `{}` so a user can
 * name one before deciding on its discovery rule.  They must never be run as
 * an unconstrained "all assets" query.
 */
export function hasConfiguredSmartCollectionQuery(
  queryDefinition: string,
): boolean {
  try {
    const value: unknown = JSON.parse(queryDefinition);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return hasMeaningfulSmartCollectionCondition(value as {
      search?: { clauses?: readonly unknown[]; groups?: ReadonlyArray<readonly unknown[]> } | null;
      filters?: readonly unknown[] | null;
      sort?: unknown;
    });
  } catch {
    return false;
  }
}
