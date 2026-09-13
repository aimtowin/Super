/**
 * Browse-scope fetch limits (Super-6w7n).
 * One query returns every lightweight row for the current scope; thumbnails
 * and heavy metadata stay on-demand.
 */
export const BROWSE_SCOPE_MAX_ASSETS = 50_000;

/**
 * Virtual-layout geometry is hydrated progressively. Keeping a single IPC
 * response at this size lets an interactive page/thumbnail request run
 * between chunks instead of waiting for a 20k–50k row serialization.
 */
export const BROWSE_LAYOUT_CHUNK_SIZE = 500;
