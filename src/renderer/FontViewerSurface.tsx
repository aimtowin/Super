import { useEffect, useState } from 'react';
import { FONT_PREVIEW_MAX_BYTES, fontPreviewBytes } from '../shared/font-media';
import { useT } from './i18n';

export function FontViewerSurface({ sourceUrl }: { sourceUrl: string }) {
  const t = useT();
  const [family, setFamily] = useState<string | null>(null), [failed, setFailed] = useState(false);
  const [sample, setSample] = useState('Super Lib · 你好世界\nThe quick brown fox jumps over the lazy dog\n0123456789'), [size, setSize] = useState(48);
  useEffect(() => {
    const controller = new AbortController(); let face: FontFace | null = null;
    queueMicrotask(() => { if (!controller.signal.aborted) {setFamily(null); setFailed(false);} });
    void (async () => {
      const response = await fetch(sourceUrl, { signal: controller.signal });
      if (!response.ok || Number(response.headers.get('content-length')) > FONT_PREVIEW_MAX_BYTES || !response.body) throw Error('Font unavailable');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
      try {
        for (;;) { const item = await reader.read(); if (item.done) break; total += item.value.length; if (total > FONT_PREVIEW_MAX_BYTES) throw Error('Font budget exceeded'); chunks.push(item.value); }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const name = 'super-font-' + crypto.randomUUID();
      face = new FontFace(name, fontPreviewBytes(bytes.buffer)); await face.load();
      if (controller.signal.aborted) return;
      document.fonts.add(face); setFamily(name);
    })().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (face) document.fonts.delete(face); };
  }, [sourceUrl]);
  return <div className="font-viewer-stage">
    <label>{t('localUpgrade.fontSample')}<textarea className="text-field" maxLength={4096} value={sample} onChange={event => setSample(event.target.value)} /></label>
    <label>{t('localUpgrade.fontSize')}<input type="range" min={12} max={144} value={size} onChange={event => setSize(Number(event.target.value))} /> {size}px</label>
    {failed ? <p role="alert">{t('localUpgrade.fontFailed')}</p> : !family ? <p role="status">{t('localUpgrade.fontLoading')}</p> : <div className="font-viewer-sample" style={{fontFamily: family, fontSize: size}}>{sample}</div>}
  </div>;
}
