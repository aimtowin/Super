/**
 * Commands that represent a foreground browse response.
 *
 * Disk reconciliation parks on `interactiveIdleUntilByLibrary` between
 * batches; these commands extend that window in the Worker entry so a
 * post-resume directory/search/smart-collection switch cannot queue behind
 * maintenance. Keep this list in lockstep with the renderer's browse
 * commands, not with background polling commands.
 */
const INTERACTIVE_BROWSE_COMMANDS: ReadonlySet<string> = new Set([
  'asset.search',
  'asset.list',
  'folder.browse-entries',
  'collection.assets.list',
  'collection.source-browse-entries',
  'smart-collection.execute',
]);

export function isInteractiveBrowseCommand(commandType: string): boolean {
  return INTERACTIVE_BROWSE_COMMANDS.has(commandType);
}