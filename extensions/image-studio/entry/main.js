// The workbench owns no gateway credential. It talks to the Super image-studio
// proxy, which validates the user-supplied password and keeps the upstream key
// on the server. This entry only orchestrates storage + proxy requests; the
// sandboxed iframe renders the UI and never receives the upstream key.
const PROXY_BASE = (globalThis.process?.env?.IMAGE_STUDIO_PROXY_URL
  || 'https://43.142.93.106/image-studio-api').replace(/\/+$/u, '');
const RESULT_TIMEOUT_MS = 600_000;

function requestKey(requestId) {
  return `igs.req.${requestId}`;
}

function resultKey(requestId) {
  return `igs.res.${requestId}`;
}

const DOWNLOAD_CHUNK_BYTES = 40 * 1024;
const DOWNLOAD_PROGRESS_PREFIX = 'igs.dprog.';
const DOWNLOAD_RESULT_PREFIX = 'igs.dres.';
const DOWNLOAD_CHUNK_PREFIX = 'igs.dchunk.';

function downloadRequestKey(requestId) {
  return `igs.dreq.${requestId}`;
}

function downloadProgressKey(requestId) {
  return `${DOWNLOAD_PROGRESS_PREFIX}${requestId}`;
}

function downloadResultKey(requestId) {
  return `${DOWNLOAD_RESULT_PREFIX}${requestId}`;
}

function downloadChunkKey(requestId, index) {
  return `${DOWNLOAD_CHUNK_PREFIX}${requestId}.${index}`;
}

async function runDownload(superApi, requestId) {
  const request = await superApi.storage.get(downloadRequestKey(requestId)).catch(() => null);
  await superApi.storage.delete(downloadRequestKey(requestId)).catch(() => undefined);
  if (request === null || typeof request !== 'object' || typeof request.url !== 'string') {
    await superApi.storage.set(downloadResultKey(requestId), {
      ok: false,
      error: { code: 'BAD_REQUEST', message: '下载请求已失效。' },
    }).catch(() => undefined);
    return;
  }
  try {
    const response = await fetch(request.url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length') || request.bytes || 0);
    const chunks = [];
    let received = 0;
    if (response.body !== null) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined) continue;
        const buffer = Buffer.from(value);
        received += buffer.byteLength;
        for (let offset = 0; offset < buffer.byteLength; offset += DOWNLOAD_CHUNK_BYTES) {
          chunks.push(buffer.subarray(offset, offset + DOWNLOAD_CHUNK_BYTES).toString('base64'));
        }
        await superApi.storage.set(downloadProgressKey(requestId), {
          received,
          total,
        }).catch(() => undefined);
      }
    }
    for (let index = 0; index < chunks.length; index += 1) {
      await superApi.storage.set(downloadChunkKey(requestId, index), chunks[index]);
    }
    await superApi.storage.set(downloadResultKey(requestId), {
      ok: true,
      chunks: chunks.length,
      size: received,
      type: response.headers.get('content-type') || 'image/png',
      total: total || received,
    });
  } catch (error) {
    await superApi.storage.set(downloadResultKey(requestId), {
      ok: false,
      error: {
        code: 'DOWNLOAD_FAILED',
        message: error instanceof Error && /timeout|aborted/iu.test(error.message)
          ? '图片下载超时。'
          : '图片下载失败，请稍后重试。',
      },
    }).catch(() => undefined);
  }
}

async function runDownloadCleanup(superApi, requestId) {
  const result = await superApi.storage.get(downloadResultKey(requestId)).catch(() => null);
  const count = result !== null && typeof result === 'object' && Number.isInteger(result.chunks)
    ? Math.max(0, Math.min(512, result.chunks))
    : 0;
  for (let index = 0; index < count; index += 1) {
    await superApi.storage.delete(downloadChunkKey(requestId, index)).catch(() => undefined);
  }
  await Promise.all([
    superApi.storage.delete(downloadRequestKey(requestId)).catch(() => undefined),
    superApi.storage.delete(downloadProgressKey(requestId)).catch(() => undefined),
    superApi.storage.delete(downloadResultKey(requestId)).catch(() => undefined),
  ]);
}

async function callProxy(path, body) {
  const response = await fetch(`${PROXY_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(RESULT_TIMEOUT_MS),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, error: { code: 'BAD_RESPONSE', message: '生图服务返回了无法解析的数据。' } };
  }
  if (!response.ok && payload?.ok !== false) {
    payload = { ok: false, error: { code: 'HTTP_ERROR', message: `生图服务请求失败（${response.status}）。` } };
  }
  return payload;
}

async function complete(superApi, requestId, result) {
  try {
    await superApi.storage.set(resultKey(requestId), result);
  } catch {
    await superApi.storage.set(resultKey(requestId), {
      ok: false,
      error: { code: 'STORAGE_FAILED', message: '生图结果无法写入插件存储。' },
    }).catch(() => undefined);
  }
}

async function runRequest(superApi, requestId, kind) {
  const request = await superApi.storage.get(requestKey(requestId)).catch(() => null);
  await superApi.storage.delete(requestKey(requestId)).catch(() => undefined);
  if (request === null || typeof request !== 'object' || typeof request.password !== 'string') {
    await complete(superApi, requestId, {
      ok: false,
      error: { code: 'BAD_REQUEST', message: '工作台请求已失效，请重试。' },
    });
    return;
  }
  try {
    if (kind === 'history') {
      const payload = await callProxy('/history', { password: request.password });
      await complete(superApi, requestId, payload);
      return;
    }
    const payload = await callProxy('/generate', {
      password: request.password,
      prompt: request.prompt,
      channel: request.channel,
      size: request.size,
      n: request.n,
    });
    await complete(superApi, requestId, payload);
  } catch (error) {
    await complete(superApi, requestId, {
      ok: false,
      error: {
        code: 'NETWORK',
        message: error instanceof Error && /timeout|aborted/iu.test(error.message)
          ? '生图请求超时，请稍后重试。'
          : '无法连接生图服务，请检查网络。',
      },
    });
  }
}

exports.setup = async function setup(superApi) {
  await superApi.commands.register('session', async (context) => {
    const requestId = Array.isArray(context.assetIds) ? context.assetIds[0] : undefined;
    if (typeof requestId === 'string' && requestId.length > 0) {
      void runRequest(superApi, requestId, 'history');
    }
  });
  await superApi.commands.register('generate', async (context) => {
    const requestId = Array.isArray(context.assetIds) ? context.assetIds[0] : undefined;
    if (typeof requestId === 'string' && requestId.length > 0) {
      void runRequest(superApi, requestId, 'generate');
    }
  });
  await superApi.commands.register('cleanup', async (context) => {
    const requestId = Array.isArray(context.assetIds) ? context.assetIds[0] : undefined;
    if (typeof requestId === 'string' && requestId.length > 0) {
      await superApi.storage.delete(resultKey(requestId)).catch(() => undefined);
    }
  });
  await superApi.commands.register('fetch-image', async (context) => {
    const requestId = Array.isArray(context.assetIds) ? context.assetIds[0] : undefined;
    if (typeof requestId === 'string' && requestId.length > 0) {
      void runDownload(superApi, requestId);
    }
  });
  await superApi.commands.register('cleanup-download', async (context) => {
    const requestId = Array.isArray(context.assetIds) ? context.assetIds[0] : undefined;
    if (typeof requestId === 'string' && requestId.length > 0) {
      await runDownloadCleanup(superApi, requestId);
    }
  });
};

exports.dispose = async function dispose() {};