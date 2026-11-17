// The host owns the detached-preview capability. This extension is installed
// so the viewer can detect it and render the dedicated button; the actual
// preview window is created through the core library bridge, never through
// arbitrary plugin DOM or Node access.
async function setup() {}

async function dispose() {}

void setup;
void dispose;