/* global exports */
exports.setup = async function setup(superApi) {
  await superApi.assets.search({ query: null, limit: 1 });
  const previous = await superApi.storage.get('host-probe');
  await superApi.storage.set('host-probe', { activated: true, source: 'trusted-host-probe', previous });
};

exports.dispose = async function dispose() {};
