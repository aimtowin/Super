async function setup(superApi) {
  const session = await superApi.input.capture({
    scope: "application",
    keyboard: true,
    pointer: false,
  });
  let count = 0;
  try {
    for await (const event of session.events) {
      await superApi.storage.set("input-capture-" + String(count), event);
      count += 1;
      if (count >= 8) break;
    }
  } finally {
    session.release();
    await superApi.storage.set("input-capture-count", count);
  }
}

void setup;
