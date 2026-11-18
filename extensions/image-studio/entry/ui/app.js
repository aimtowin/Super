'use strict';

const SIZE_PRESETS = [
  { label: '方形 1024', width: 1024, height: 1024 },
  { label: '横幅 1536×1024', width: 1536, height: 1024 },
  { label: '竖幅 1024×1536', width: 1024, height: 1536 },
  { label: '4K 横 3840×2160', width: 3840, height: 2160 },
  { label: '4K 宽 4096×1760', width: 4096, height: 1760 },
];
const RESULT_TIMEOUT_MS = 600_000;
const POLL_MS = 700;

const state = {
  contributionId: '',
  instanceId: '',
  mounted: false,
  password: '',
  busy: false,
  size: { width: 1024, height: 1024 },
  channel: 'native',
  count: 1,
  history: [],
  stageBlobUrls: [],
  pending: new Map(),
  commandErrors: new Map(),
};

const $ = (id) => document.getElementById(id);
const app = $('app');
const lockScreen = $('lockScreen');
const studio = $('studio');
const passwordInput = $('password');
const unlockError = $('unlockError');
const unlockButton = $('unlockButton');
const sessionChip = $('sessionChip');
const sessionLabel = $('sessionLabel');
const lockButton = $('lockButton');
const promptInput = $('prompt');
const promptCount = $('promptCount');
const sizePresets = $('sizePresets');
const customWidth = $('customWidth');
const customHeight = $('customHeight');
const counts = $('counts');
const generateButton = $('generateButton');
const controlStatus = $('controlStatus');
const resultStatus = $('resultStatus');
const stage = $('stage');
const history = $('history');
const historyEmpty = $('historyEmpty');
const toast = $('toast');

function parseContext() {
  const params = new URLSearchParams(window.location.search);
  state.contributionId = params.get('contributionId') || '';
  const segments = window.location.pathname.split('/').filter(Boolean);
  state.instanceId = segments[0] ? decodeURIComponent(segments[0]) : '';
}

function post(message) {
  window.parent.postMessage(message, '*');
}

function postReady() {
  if (state.contributionId.length === 0 || state.instanceId.length === 0) return;
  post({
    type: 'plugin-ui.ready',
    contributionId: state.contributionId,
    instanceId: state.instanceId,
    viewType: 'sidebar',
    scope: 'library',
  });
}

function requestId() {
  return crypto.randomUUID();
}

function storageRequest(kind, payload) {
  const id = requestId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error('storage-timeout'));
    }, 12_000);
    state.pending.set(id, { resolve, reject, timer });
    post(payload.type === 'get'
      ? { type: 'plugin-ui.storage.get', requestId: id, key: payload.key }
      : { type: 'plugin-ui.storage.set', requestId: id, key: payload.key, value: payload.value });
  });
}

async function storageGet(key) {
  const result = await storageRequest('get', { type: 'get', key });
  return result.ok ? result.value ?? null : null;
}

async function storageSet(key, value) {
  const result = await storageRequest('set', { type: 'set', key, value });
  if (!result.ok) throw new Error(result.errorCode || 'storage-write-failed');
}

function invokeCommand(commandId, requestKey) {
  const id = requestId();
  state.commandErrors.delete(id);
  post({
    type: 'plugin-ui.invoke-command',
    requestId: id,
    commandId,
    context: { assetIds: [requestKey] },
  });
  return id;
}

async function waitResult(requestIdValue) {
  const key = `igs.res.${requestIdValue}`;
  const started = Date.now();
  while (Date.now() - started < RESULT_TIMEOUT_MS) {
    const result = await storageGet(key);
    if (result !== null) return result;
    const commandError = state.commandErrors.get(requestIdValue);
    if (commandError !== undefined) {
      throw new Error(commandError);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error('result-timeout');
}

async function runCommand(kind, payload) {
  const id = requestId();
  await storageSet(`igs.req.${id}`, payload);
  invokeCommand(kind, id);
  try {
    return await waitResult(id);
  } catch (error) {
    throw error;
  } finally {
    invokeCommand('cleanup', id);
    state.commandErrors.delete(id);
  }
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.toggle('is-error', isError);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function setSession(chip, label) {
  sessionChip.classList.toggle('is-unlocked', chip);
  sessionLabel.textContent = label;
  lockButton.hidden = !chip;
}

function setBusy(value) {
  state.busy = value;
  generateButton.disabled = value || state.password.length === 0;
  generateButton.classList.toggle('is-busy', value);
  generateButton.querySelector('.button-label').textContent = value ? '生成中…' : '生成素材';
  resultStatus.classList.toggle('is-busy', value);
  if (value) resultStatus.textContent = '正在生成';
  controlStatus.textContent = value ? '上游生成中，通常需要 1–2 分钟' : '准备就绪';
}

function normalizeSize(width, height) {
  const clamp = (value) => {
    const safe = Number.isFinite(value) ? Math.round(value / 16) * 16 : 1024;
    return Math.min(4096, Math.max(256, safe));
  };
  return { width: clamp(width), height: clamp(height) };
}

function setSize(width, height, options = {}) {
  state.size = normalizeSize(width, height);
  customWidth.value = String(state.size.width);
  customHeight.value = String(state.size.height);
  for (const button of sizePresets.querySelectorAll('button')) {
    const active = Number(button.dataset.width) === state.size.width
      && Number(button.dataset.height) === state.size.height;
    button.classList.toggle('is-active', active);
  }
  if (options.toast) showToast(`尺寸已设为 ${state.size.width} × ${state.size.height}`);
}

function setChannel(channel) {
  state.channel = channel === 'upscale' ? 'upscale' : 'native';
  for (const button of $('channels').querySelectorAll('button')) {
    button.classList.toggle('is-active', button.dataset.channel === state.channel);
  }
}

function setCount(value) {
  state.count = Math.min(4, Math.max(1, value));
  for (const button of counts.querySelectorAll('button')) {
    button.classList.toggle('is-active', Number(button.dataset.count) === state.count);
  }
}

function renderSizes() {
  for (const preset of SIZE_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.width = String(preset.width);
    button.dataset.height = String(preset.height);
    button.textContent = preset.label;
    button.addEventListener('click', () => setSize(preset.width, preset.height));
    sizePresets.append(button);
  }
  setSize(state.size.width, state.size.height);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderEmptyStage() {
  stage.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'empty-stage';
  empty.innerHTML = '<span class="empty-glyph" aria-hidden="true">✦</span>'
    + '<strong>从一个画面描述开始</strong>'
    + '<p>左侧设置尺寸与数量，生成的素材会出现在这里。</p>';
  stage.append(empty);
}

function clearStageBlobs() {
  for (const url of state.stageBlobUrls) URL.revokeObjectURL(url);
  state.stageBlobUrls = [];
}

function renderLoadingStage() {
  clearStageBlobs();
  stage.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'stage-loading';
  loading.innerHTML = '<span class="loader-ring" aria-hidden="true"></span>'
    + `<p>正在等待上游生成 ${state.count} 张素材…</p>`
    + '<small>通常需要 1–2 分钟；服务器收到图片后会立即进入下载</small>';
  stage.append(loading);
}

function renderErrorStage(message, detail) {
  clearStageBlobs();
  stage.replaceChildren();
  const error = document.createElement('div');
  error.className = 'stage-error';
  const title = document.createElement('strong');
  title.textContent = message || '生成失败';
  const copy = document.createElement('p');
  copy.textContent = detail || '请检查密码、网络或尺寸参数后重试。';
  error.append(title, copy);
  stage.append(error);
}

function dataUrlToBlob(url) {
  const comma = url.indexOf(',');
  if (comma < 0) throw new Error('invalid-data-url');
  const meta = url.slice(0, comma);
  const payload = url.slice(comma + 1);
  const mime = /data:([^;,]+)/u.exec(meta)?.[1] || 'image/png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

async function downloadImageBlob(image, onProgress) {
  if (typeof image.url === 'string' && image.url.startsWith('data:')) {
    const blob = dataUrlToBlob(image.url);
    onProgress(blob.size, blob.size);
    return blob;
  }
  const response = await fetch(image.url, {
    cache: 'no-store',
    mode: 'cors',
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
  const headerLength = Number(response.headers.get('content-length') || 0);
  const total = headerLength > 0 ? headerLength : Number(image.bytes || 0);
  if (response.body === null) {
    const blob = await response.blob();
    onProgress(blob.size, blob.size || total);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      received += value.byteLength;
      onProgress(received, total);
    }
  }
  const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'image/png' });
  onProgress(blob.size, blob.size || total);
  return blob;
}

function renderStage(record) {
  clearStageBlobs();
  stage.replaceChildren();
  const grid = document.createElement('div');
  grid.className = `stage-grid${record.images.length === 1 ? ' single' : ''}`;
  const downloads = [];
  for (const image of record.images) {
    const card = document.createElement('article');
    card.className = 'stage-card is-downloading';
    const progress = document.createElement('div');
    progress.className = 'stage-download';
    progress.innerHTML = '<div class="stage-download-head"><strong>服务器已接收，正在下载</strong><span class="stage-download-percent">0%</span></div>'
      + '<div class="stage-download-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>'
      + `<div class="stage-download-bytes">0 B / ${formatBytes(image.bytes)}</div>`;
    const img = document.createElement('img');
    img.alt = record.prompt.slice(0, 80);
    img.hidden = true;
    const meta = document.createElement('div');
    meta.className = 'stage-meta';
    const info = document.createElement('span');
    info.textContent = `${record.channel === 'upscale' ? '超分' : '原生'} · ${image.width} × ${image.height} · ${formatBytes(image.bytes)}`;
    meta.append(info);
    card.append(progress, img, meta);
    grid.append(card);
    const percentNode = progress.querySelector('.stage-download-percent');
    const barNode = progress.querySelector('.stage-download-bar');
    const barFill = progress.querySelector('.stage-download-bar span');
    const bytesNode = progress.querySelector('.stage-download-bytes');
    const task = downloadImageBlob(image, (received, total) => {
      const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
      if (percentNode) percentNode.textContent = `${percent}%`;
      if (barNode) barNode.setAttribute('aria-valuenow', String(percent));
      if (barFill) barFill.style.width = `${percent}%`;
      if (bytesNode) bytesNode.textContent = `${formatBytes(received)} / ${formatBytes(total || image.bytes)}`;
    }).then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      state.stageBlobUrls.push(objectUrl);
      img.src = objectUrl;
      img.hidden = false;
      card.classList.remove('is-downloading');
      card.classList.add('is-downloaded');
      progress.remove();
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `super-image-${record.id}-${record.images.indexOf(image) + 1}.png`;
      link.textContent = '下载原图';
      meta.append(link);
    }).catch(() => {
      // Hosts before the streaming-download capability blocked iframe fetch
      // with `connect-src 'none'`. Fall back to the original image element so
      // the generated asset still arrives; the next host build shows progress.
      card.classList.remove('is-downloading');
      progress.remove();
      img.hidden = false;
      img.src = image.url;
      card.classList.add('is-downloaded');
      const link = document.createElement('a');
      link.href = image.downloadUrl;
      link.download = '';
      link.textContent = '下载原图';
      meta.append(link);
    });
    downloads.push(task);
  }
  stage.append(grid);
  return Promise.allSettled(downloads).then(() => {
    const failed = stage.querySelectorAll('.is-download-failed').length;
    if (failed === 0) {
      resultStatus.textContent = '下载完成';
      resultStatus.classList.remove('is-busy');
      resultStatus.classList.add('is-done');
    } else {
      resultStatus.textContent = `${failed} 张下载失败`;
      resultStatus.classList.remove('is-busy');
      resultStatus.classList.add('is-error');
    }
  });
}

function renderHistory() {
  history.replaceChildren();
  historyEmpty.hidden = state.history.length > 0;
  for (const record of state.history.slice(0, 30)) {
    const card = document.createElement('article');
    card.className = 'history-card';
    const thumbs = document.createElement('div');
    thumbs.className = 'history-thumbs';
    for (const image of record.images.slice(0, 2)) {
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = record.prompt.slice(0, 60);
      img.loading = 'lazy';
      thumbs.append(img);
    }
    const body = document.createElement('div');
    body.className = 'history-body';
    const copy = document.createElement('p');
    copy.className = 'history-prompt';
    copy.textContent = record.prompt;
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const stamp = document.createElement('span');
    stamp.textContent = `${formatTime(record.createdAt)} · ${record.channel === 'upscale' ? '超分' : '原生'} · ${record.images.length} 张`;
    const link = document.createElement('a');
    link.href = record.images[0]?.downloadUrl || '#';
    link.download = '';
    link.textContent = '下载';
    meta.append(stamp, link);
    body.append(copy, meta);
    card.append(thumbs, body);
    history.append(card);
  }
}

function setUnlocked(unlocked) {
  lockScreen.hidden = unlocked;
  studio.hidden = !unlocked;
  setSession(unlocked, unlocked ? '已解锁 · 本次会话' : '未解锁');
  if (!unlocked) {
    state.password = '';
    passwordInput.value = '';
    state.history = [];
    clearStageBlobs();
  }
}

async function unlock(password) {
  unlockButton.disabled = true;
  unlockError.hidden = true;
  try {
    const result = await runCommand('session', { password });
    if (!result || result.ok !== true) {
      throw new Error(result?.error?.message || '密码不正确或服务不可用。');
    }
    state.password = password;
    state.history = Array.isArray(result.records) ? result.records : [];
    setUnlocked(true);
    renderHistory();
    renderEmptyStage();
    promptInput.focus();
  } catch (error) {
    unlockError.textContent = error instanceof Error ? error.message : '无法解锁工作台。';
    unlockError.hidden = false;
  } finally {
    unlockButton.disabled = false;
  }
}

async function generate() {
  if (state.busy || state.password.length === 0) return;
  const prompt = promptInput.value.trim();
  if (prompt.length === 0) {
    showToast('请先填写画面描述。', true);
    promptInput.focus();
    return;
  }
  if (prompt.length > 4000) {
    showToast('画面描述最多 4000 个字符。', true);
    return;
  }
  setBusy(true);
  renderLoadingStage();
  resultStatus.textContent = '正在生成';
  resultStatus.classList.remove('is-error', 'is-done');
  try {
    const result = await runCommand('generate', {
      password: state.password,
      prompt,
      channel: state.channel,
      size: `${state.size.width}x${state.size.height}`,
      n: state.count,
    });
    if (!result || result.ok !== true || !result.record) {
      const error = result?.error;
      throw new Error(error?.message || '生成失败，请稍后重试。');
    }
    state.history = [result.record, ...state.history.filter((entry) => entry.id !== result.record.id)];
    renderHistory();
    resultStatus.classList.remove('is-busy', 'is-error', 'is-done');
    resultStatus.textContent = '服务器已接收，正在下载…';
    showToast(`服务器已接收 ${result.record.images.length} 张素材，开始下载`);
    void renderStage(result.record);
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成失败。';
    renderErrorStage(message);
    resultStatus.textContent = '生成失败';
    resultStatus.classList.add('is-error');
    showToast(message, true);
  } finally {
    setBusy(false);
    if (resultStatus.classList.contains('is-busy')) resultStatus.textContent = '等待生成';
  }
}

async function refreshHistory() {
  const result = await runCommand('session', { password: state.password });
  if (!result || result.ok !== true) {
    showToast(result?.error?.message || '无法读取历史。', true);
    return;
  }
  state.history = Array.isArray(result.records) ? result.records : [];
  renderHistory();
  showToast('历史已刷新');
}

function applyTheme(message) {
  if (message.theme === 'light' || message.theme === 'dark') {
    document.documentElement.dataset.theme = message.theme;
  }
  for (const [name, value] of Object.entries(message.tokens || {})) {
    if (name.startsWith('--ui-') && typeof value === 'string') {
      document.documentElement.style.setProperty(name, value);
    }
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (message === null || typeof message !== 'object') return;
  if (message.type === 'plugin-ui.storage.result') {
    const pending = state.pending.get(message.requestId);
    if (!pending) return;
    state.pending.delete(message.requestId);
    clearTimeout(pending.timer);
    pending.resolve(message);
    return;
  }
  if (message.type === 'plugin-ui.command-result') {
    if (message.ok !== true) state.commandErrors.set(message.requestId, message.errorCode || 'command-failed');
    return;
  }
  if (message.type === 'plugin-ui.theme-changed') {
    applyTheme(message);
    return;
  }
  if (message.type === 'plugin-ui.view-mounted') {
    state.mounted = true;
  }
});

function bind() {
  for (const button of counts.querySelectorAll('button')) {
    button.addEventListener('click', () => setCount(Number(button.dataset.count)));
  }
  for (const button of $('channels').querySelectorAll('button')) {
    button.addEventListener('click', () => setChannel(button.dataset.channel));
  }
  $('applySize').addEventListener('click', () => {
    setSize(Number(customWidth.value), Number(customHeight.value), { toast: true });
  });
  for (const input of [customWidth, customHeight]) {
    input.addEventListener('change', () => {
      setSize(Number(customWidth.value), Number(customHeight.value));
    });
  }
  for (const button of document.querySelectorAll('[data-prompt]')) {
    button.addEventListener('click', () => {
      promptInput.value = button.dataset.prompt || '';
      promptInput.dispatchEvent(new Event('input'));
      promptInput.focus();
    });
  }
  promptInput.addEventListener('input', () => {
    promptCount.textContent = `${promptInput.value.length} / 4000`;
  });
  promptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void generate();
    }
  });
  $('unlockForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const password = passwordInput.value;
    if (password.length === 0) {
      unlockError.textContent = '请输入访问密码。';
      unlockError.hidden = false;
      return;
    }
    void unlock(password);
  });
  generateButton.addEventListener('click', () => void generate());
  lockButton.addEventListener('click', () => setUnlocked(false));
  $('refreshHistory').addEventListener('click', () => void refreshHistory());
  window.addEventListener('pagehide', () => {
    state.password = '';
    clearStageBlobs();
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('view-unmounted'));
    }
    state.pending.clear();
  });
}

parseContext();
bind();
setChannel(state.channel);
renderSizes();
renderEmptyStage();
setUnlocked(false);
postReady();
let readyAttempts = 0;
const readyTimer = setInterval(() => {
  readyAttempts += 1;
  if (state.mounted || readyAttempts > 20) {
    clearInterval(readyTimer);
    return;
  }
  postReady();
}, 500);