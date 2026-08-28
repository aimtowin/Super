/* global exports */
exports.setup = async function setup(superApi) {
  await superApi.storage.set('host-probe', { activated: true, source: 'unrestricted-settings-probe' });
  superApi.commands.register('probe.write-selection', async (context) => {
    const assetId = Array.isArray(context?.assetIds) ? context.assetIds[0] ?? null : null;
    await superApi.storage.set('menu-command', { assetId });
  });
  superApi.commands.register('probe.nested-selection', async (context) => {
    const assetId = Array.isArray(context?.assetIds) ? context.assetIds[0] ?? null : null;
    await superApi.storage.set('nested-menu-command', { assetId });
  });
};

exports.dispose = async function dispose() {};
