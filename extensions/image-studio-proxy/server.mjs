import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.IMAGE_STUDIO_PORT || 8791);
const BASE_URL = (process.env.IMAGE_BASE_URL || 'https://api.liuyangyang.online/v1').replace(/\/+$/u, '');
const API_KEY = process.env.IMAGE_API_KEY || '';
const PASSWORD = process.env.IMAGE_STUDIO_PASSWORD || '';
const OUTPUT_DIR = process.env.IMAGE_STUDIO_OUTPUT_DIR || '/var/www/super-updates/image-studio';
const PUBLIC_BASE_URL = (process.env.IMAGE_STUDIO_PUBLIC_BASE_URL || 'https://43.142.93.106').replace(/\/+$/u, '');
const HISTORY_LIMIT = Math.min(Math.max(Number(process.env.IMAGE_STUDIO_HISTORY_LIMIT || 80), 1), 200);
const MODEL = 'gpt-image-2.6';
const TIMEOUT_MS = 310_000;
const MAX_BODY_BYTES = 128 * 1024;
const HISTORY_FILE = path.join(OUTPUT_DIR, 'history.json');
const DOWNLOAD_TOKENS = new Map();
const RATE = new Map();

if (!API_KEY) throw new Error('IMAGE_API_KEY is required.');
if (!PASSWORD) throw new Error('IMAGE_STUDIO_PASSWORD is required.');
mkdirSync(OUTPUT_DIR, { recursive: true });

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.byteLength,
    'cache-control': 'no-store',
  });
  response.end(body);
}

function passwordMatches(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const expected = Buffer.from(PASSWORD, 'utf8');
  const actual = Buffer.from(value, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function clientKey(request) {
  return request.socket.remoteAddress || 'unknown';
}

function rateLimited(request) {
  const now = Date.now();
  const key = clientKey(request);
  const entry = RATE.get(key) ?? { windowStart: now, count: 0 };
  if (now - entry.windowStart > 60_000) {
    entry.windowStart = now;
    entry.count = 0;
  }
  entry.count += 1;
  RATE.set(key, entry);
  return entry.count > 30;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('BODY_TOO_LARGE'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    request.on('error', reject);
  });
}

function validateGenerate(body) {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 1 || prompt.length > 4000) throw new Error('INVALID_PROMPT');
  const n = Number(body.n ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error('INVALID_COUNT');
  const size = typeof body.size === 'string' ? body.size : '1024x1024';
  const match = /^(\d{3,4})x(\d{3,4})$/u.exec(size);
  if (!match) throw new Error('INVALID_SIZE');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 256 || height < 256 || width > 4096 || height > 4096
    || width % 16 !== 0 || height % 16 !== 0) {
    throw new Error('INVALID_SIZE');
  }
  return { prompt, n, size, width, height };
}

function publicImageUrl(relativePath) {
  return `${PUBLIC_BASE_URL}/downloads/super/image-studio/${relativePath.split(path.sep).join('/')}`;
}

function createDownloadUrl(absolutePath) {
  const token = randomUUID();
  DOWNLOAD_TOKENS.set(token, { path: absolutePath, expiresAt: Date.now() + 10 * 60_000 });
  for (const [key, value] of DOWNLOAD_TOKENS) {
    if (value.expiresAt <= Date.now()) DOWNLOAD_TOKENS.delete(key);
  }
  return `${PUBLIC_BASE_URL}/image-studio-api/download/${token}`;
}

function imageRecord(file, width, height, bytes) {
  const relative = path.relative(OUTPUT_DIR, file);
  return {
    url: publicImageUrl(relative),
    downloadUrl: createDownloadUrl(file),
    width,
    height,
    bytes,
  };
}

function readHistory() {
  try {
    const parsed = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  const temporary = `${HISTORY_FILE}.tmp`;
  writeFileSync(temporary, JSON.stringify(entries.slice(0, HISTORY_LIMIT)), 'utf8');
  renameSync(temporary, HISTORY_FILE);
}

function appendHistory(record) {
  const entries = [record, ...readHistory().filter((entry) => entry.id !== record.id)].slice(0, HISTORY_LIMIT);
  writeHistory(entries);
  return entries;
}

function historyForClient(entries) {
  return entries.map((entry) => ({
    ...entry,
    images: entry.images.map((image) => {
      const relative = new URL(image.url).pathname.replace('/downloads/super/image-studio/', '');
      const absolute = path.join(OUTPUT_DIR, relative);
      return existsSync(absolute)
        ? {
          ...image,
          downloadUrl: createDownloadUrl(absolute),
        }
        : image;
    }),
  }));
}

async function saveImage(item, generatedAt, width, height) {
  let bytes;
  if (typeof item?.b64_json === 'string' && item.b64_json.length > 0) {
    bytes = Buffer.from(item.b64_json, 'base64');
  } else if (typeof item?.url === 'string' && /^https:\/\//u.test(item.url)) {
    const downloaded = await fetch(item.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!downloaded.ok) throw new Error('IMAGE_DOWNLOAD_FAILED');
    bytes = Buffer.from(await downloaded.arrayBuffer());
  } else {
    throw new Error('EMPTY_IMAGE');
  }
  if (bytes.byteLength === 0 || bytes.byteLength > 30 * 1024 * 1024) throw new Error('INVALID_IMAGE_BYTES');
  const month = generatedAt.slice(0, 7);
  const directory = path.join(OUTPUT_DIR, month);
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${randomUUID()}.png`);
  writeFileSync(file, bytes);
  return imageRecord(file, width, height, bytes.byteLength);
}

function upstreamError(status, body) {
  if (status === 401 || status === 403) {
    return { code: 'UPSTREAM_AUTH', message: '上游网关鉴权失败，请联系维护者。' };
  }
  if (status === 422) {
    return { code: 'UPSTREAM_SIZE', message: '上游拒绝了尺寸参数：宽高需为 16 的倍数。' };
  }
  if (status === 429) {
    return { code: 'UPSTREAM_RATE_LIMIT', message: '上游限流，请稍后再试。' };
  }
  if (status === 524) {
    return { code: 'UPSTREAM_TIMEOUT', message: '上游网关超时（524），本次失败不计费。' };
  }
  const detail = body.slice(0, 240);
  return { code: 'UPSTREAM_FAILED', message: `上游请求失败（${status}）${detail ? `：${detail}` : ''}` };
}

async function generate(body) {
  const input = validateGenerate(body);
  const response = await fetch(`${BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: input.prompt,
      n: input.n,
      size: input.size,
      response_format: 'b64_json',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, error: upstreamError(response.status, text) };
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'UPSTREAM_INVALID_JSON', message: '上游返回了无法解析的数据。' } };
  }
  const items = Array.isArray(payload.data) ? payload.data : [];
  if (items.length === 0) {
    return { ok: false, error: { code: 'UPSTREAM_EMPTY', message: '上游没有返回图片。' } };
  }
  const generatedAt = new Date().toISOString();
  const images = [];
  for (const item of items.slice(0, input.n)) {
    images.push(await saveImage(item, generatedAt, input.width, input.height));
  }
  const record = {
    id: randomUUID(),
    createdAt: generatedAt,
    prompt: input.prompt,
    model: MODEL,
    size: input.size,
    images,
  };
  appendHistory(record);
  return { ok: true, record };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/health') {
      json(response, 200, { ok: true });
      return;
    }
    if (url.pathname.startsWith('/download/') && request.method === 'GET') {
      const token = url.pathname.slice('/download/'.length);
      const entry = DOWNLOAD_TOKENS.get(token);
      if (!entry || entry.expiresAt <= Date.now() || !existsSync(entry.path)) {
        json(response, 404, { ok: false, error: { code: 'DOWNLOAD_EXPIRED' } });
        return;
      }
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-disposition': `attachment; filename="${path.basename(entry.path)}"`,
        'cache-control': 'private, max-age=600',
      });
      createReadStream(entry.path).pipe(response);
      return;
    }
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED' } });
      return;
    }
    if (rateLimited(request)) {
      json(response, 429, { ok: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试。' } });
      return;
    }
    const body = await readBody(request);
    if (!passwordMatches(body?.password)) {
      json(response, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: '密码不正确。' } });
      return;
    }
    if (url.pathname === '/history') {
      json(response, 200, { ok: true, records: historyForClient(readHistory().slice(0, 50)) });
      return;
    }
    if (url.pathname === '/generate') {
      const result = await generate(body);
      json(response, result.ok ? 200 : 502, result);
      return;
    }
    json(response, 404, { ok: false, error: { code: 'NOT_FOUND' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SERVER_ERROR';
    json(response, code.startsWith('INVALID_') ? 400 : 500, {
      ok: false,
      error: {
        code: code.startsWith('INVALID_') ? code : 'SERVER_ERROR',
        message: code === 'BODY_TOO_LARGE'
          ? '请求过大。'
          : code === 'INVALID_JSON'
            ? '请求格式无效。'
            : '生图服务暂时不可用。',
      },
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`[image-studio] listening on 127.0.0.1:${PORT}\n`);
});