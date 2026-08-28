async function setup(superApi) {
  await superApi.storage.set('setup-started', true);
  superApi.jobs.registerHandler('tick', async (payload) => {
    const storedAttempts = await superApi.storage.get('job-attempts');
    const attempts = Number(storedAttempts ?? 0);
    await superApi.storage.set('job-attempts', attempts + 1);
    // The first execution intentionally remains in flight. The E2E test kills
    // the entire application, then verifies that the unfinished job remains
    // interrupted and that a later explicit command can enqueue a new job.
    if (attempts === 0) {
      await new Promise(() => {});
    }
    await superApi.storage.set('job-tick', payload);
  });
  superApi.commands.register('start', async () => {
    await enqueueJob(superApi);
  });
}

async function enqueueJob(superApi) {
  await superApi.jobs.enqueue({
    handlerId: 'tick',
    payload: { tick: 1 },
  });
}

async function dispose() {}

void setup;
void dispose;
