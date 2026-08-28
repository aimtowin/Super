async function setup(superApi) {
  superApi.commands.register('probe.write-selection', async (context) => {
    const enabledDemo = await superApi.storage.get('settings.enabled-demo');
    await superApi.storage.set('menu-command', {
      assetId: context.assetIds && context.assetIds[0],
      enabledDemo,
    });
  });
  superApi.commands.register('probe.write-folder', async (context) => {
    await superApi.storage.set('menu-command-folder', {
      folderId: context.folderIds && context.folderIds[0],
    });
  });
  superApi.commands.register('probe.write-collection', async (context) => {
    await superApi.storage.set('menu-command-collection', {
      collectionId: context.collectionIds && context.collectionIds[0],
    });
  });
  superApi.commands.register('probe.write-toolbar', async (context) => {
    await superApi.storage.set('toolbar-command', {
      assetId: context.assetIds && context.assetIds[0],
      assetCount: context.assetIds ? context.assetIds.length : 0,
    });
  });
  superApi.commands.register('probe.write-inspector', async (context) => {
    await superApi.storage.set('inspector-command', {
      assetId: context.assetIds && context.assetIds[0],
      assetCount: context.assetIds ? context.assetIds.length : 0,
    });
  });
  superApi.commands.register('probe.write-viewer', async (context) => {
    await superApi.storage.set('viewer-command', {
      assetId: context.assetIds && context.assetIds[0],
    });
  });
  superApi.commands.register('probe.write-workspace', async (context) => {
    await superApi.storage.set('workspace-command', {
      assetId: context.assetIds && context.assetIds[0],
      assetCount: context.assetIds ? context.assetIds.length : 0,
    });
  });
  superApi.commands.register('probe.write-shortcut', async (context) => {
    await superApi.storage.set('shortcut-command', {
      assetId: context.assetIds && context.assetIds[0],
      assetCount: context.assetIds ? context.assetIds.length : 0,
    });
  });
}

async function dispose() {}

void setup;
void dispose;
