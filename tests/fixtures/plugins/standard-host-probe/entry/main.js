async function setup(superApi) {
  await superApi.assets.search({ query: null, limit: 1 });
  const previous = await superApi.storage.get('host-probe');
  await superApi.storage.set('host-probe', { activated: true, source: 'standard-host-probe', previous });
}

async function dispose() {}

void setup;
void dispose;
