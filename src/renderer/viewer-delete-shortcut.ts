import type { AssetSummary } from '../shared/asset-types';
import type { CommandPlatform } from './commands/command-types';
import { matchAssetActionKeyboardCommand } from './asset-action-keyboard';

export function viewerDeleteAction(event: KeyboardEvent, platform: CommandPlatform, asset: AssetSummary): 'trash' | 'disk' | null {
  if (event.repeat || asset.deletedAt || asset.availability !== 'available') return null;
  if (matchAssetActionKeyboardCommand('asset.delete-from-disk', event, platform)) return asset.locationKind === 'managed' ? 'disk' : null;
  return matchAssetActionKeyboardCommand('asset.move-to-trash', event, platform) ? 'trash' : null;
}
