async function setup(superApi) {
  superApi.commands.register('probe.write', async () => {
    await superApi.storage.set('iframe-command', {
      invoked: true,
      source: 'workspace-iframe',
    });
  });
}

async function dispose() {}

void setup;
void dispose;
