import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ZoomableImage } from './zoomable-preview-image';
import { useViewerZoomPan } from './use-viewer-zoom-pan';
import { useT } from './i18n';
import { shouldHandleVideoSpaceKey } from './video-player-controls';
import { type ViewerDisplayTransform } from './viewer-display-transform';

type GifFrame = { displayWidth: number; displayHeight: number; duration: number | null; close(): void };
type GifDecoder = { tracks: {ready: Promise<void>; selectedTrack: { frameCount: number } | null}; decode(input: {frameIndex: number}): Promise<{image: GifFrame}>; close(): void };
type DecoderConstructor = new (input: {type: string; data: ArrayBuffer}) => GifDecoder;

/** One decoded frame at a time, bounded compressed input, never an all-frame bitmap cache. */
export function GifViewerSurface({src, alt, displayTransform, onFullscreen, onSwipeNext, onSwipePrevious, fitRequestToken}: {
  src: string; alt: string; displayTransform: ViewerDisplayTransform; onFullscreen(): void;
  onSwipeNext?: () => void; onSwipePrevious?: () => void; fitRequestToken?: number;
}) {
  const t = useT(), canvas = useRef<HTMLCanvasElement>(null), decoder = useRef<GifDecoder | null>(null);
  const playing = useRef(true), requested = useRef<number | null>(null);
  const wake = useRef<() => void>(() => {}), transform = useRef(displayTransform);
  useLayoutEffect(() => { transform.current = displayTransform; }, [displayTransform]);
  const [paused, setPaused] = useState(false), [frameIndex, setFrameIndex] = useState(0), [count, setCount] = useState(0), [fallback, setFallback] = useState(false);
  const { view, natural, viewportRef, viewportPointerHandlers, measureAndFit, fitToWindow } = useViewerZoomPan({onSwipeNext,onSwipePrevious});
  const toggle = useCallback(() => { playing.current = !playing.current; setPaused(!playing.current); wake.current(); }, []);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined, current = 0, initialized = false, frames = 0, drawing = false, queued = false;
    const draw = async () => {
      if (controller.signal.aborted || !decoder.current) return;
      if (drawing) { queued = true; return; }
      if (!playing.current && requested.current === null && initialized) return;
      if (requested.current !== null) { current = requested.current; requested.current = null; }
      drawing = true;
      let image: GifFrame | undefined;
      try {
        image = (await decoder.current.decode({frameIndex: current})).image;
        if (controller.signal.aborted) return;
        if (image.displayWidth * image.displayHeight > 16_777_216) throw Error('GIF exceeds decoded-frame budget');
        const target = canvas.current, context = target?.getContext('2d');
        if (!target || !context) return;
        const { quarterTurns, flipHorizontal, flipVertical } = transform.current;
        const odd = Math.abs(quarterTurns % 2) === 1;
        const width = odd ? image.displayHeight : image.displayWidth;
        const height = odd ? image.displayWidth : image.displayHeight;
        if (!initialized || target.width !== width || target.height !== height) {
          target.width = width; target.height = height;
          measureAndFit('reset', { w: width, h: height }); initialized = true;
        }
        context.clearRect(0, 0, width, height);
        context.save();
        context.translate(width / 2, height / 2);
        context.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
        context.rotate(quarterTurns * Math.PI / 2);
        context.drawImage(image as unknown as CanvasImageSource, -image.displayWidth / 2, -image.displayHeight / 2);
        context.restore();
        setFrameIndex(current); if (playing.current) current = (current + 1) % frames;
        if (playing.current) timer = setTimeout(() => void draw().catch(fail), Math.max(20, Math.min(5000, (image.duration ?? 100000) / 1000)));
      } finally {
        image?.close(); drawing = false;
        if (queued && !controller.signal.aborted) { queued = false; wake.current(); }
      }
    };
    wake.current = () => { clearTimeout(timer); timer = setTimeout(() => void draw().catch(fail), 0); };
    const fail = (error: unknown) => { if (!controller.signal.aborted) { decoder.current?.close(); decoder.current = null; console.warn('GIF frame preview unavailable:', error instanceof Error ? error.message : String(error)); setFallback(true); } };
    void (async () => {
      const Constructor = (globalThis as unknown as {ImageDecoder?: DecoderConstructor}).ImageDecoder;
      if (!Constructor) throw Error('ImageDecoder unavailable');
      const response = await fetch(src,{signal:controller.signal});
      if (!response.ok || !response.body || Number(response.headers.get('content-length')) > 32 * 1024 * 1024) throw Error('GIF unavailable or oversized');
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
      try { for (;;) { const item = await reader.read(); if (item.done) break; total += item.value.length; if (total > 32 * 1024 * 1024) throw Error('GIF input budget exceeded'); chunks.push(item.value); } } finally { await reader.cancel(); }
      const data = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { data.set(chunk,offset); offset += chunk.length; }
      if (controller.signal.aborted) return;
      const instance = new Constructor({type:'image/gif',data:data.buffer}); decoder.current = instance; await instance.tracks.ready;
      if (controller.signal.aborted) return;
      frames = instance.tracks.selectedTrack?.frameCount ?? 0;
      if (frames < 1 || frames > 10000) throw Error('GIF frame budget exceeded');
      setCount(frames); await draw();
    })().catch(fail);
    return () => { controller.abort(); wake.current = () => {}; clearTimeout(timer); decoder.current?.close(); decoder.current = null; };
  }, [src, measureAndFit]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (!fallback && shouldHandleVideoSpaceKey(event) && !document.querySelector('[role="dialog"][aria-modal="true"]')) { event.preventDefault(); event.stopPropagation(); toggle(); } };
    window.addEventListener('keydown',key,true); return () => window.removeEventListener('keydown',key,true);
  }, [toggle, fallback]);
  const lastFrame = useRef(0);
  useLayoutEffect(() => { lastFrame.current = frameIndex; }, [frameIndex]);
  useEffect(() => { requested.current = lastFrame.current; wake.current(); }, [displayTransform]);
  useEffect(() => { if (fitRequestToken !== undefined && fitRequestToken > 0) fitToWindow(); }, [fitRequestToken,fitToWindow]);
  if (fallback) return <ZoomableImage src={src} alt={alt} displayTransform={displayTransform} onFullscreen={onFullscreen} onSwipeNext={onSwipeNext} onSwipePrevious={onSwipePrevious} />;
  return <div className="gif-viewer-stage">
    <div className="preview-image-viewport" ref={viewportRef} {...viewportPointerHandlers}>
      <canvas ref={canvas} aria-label={alt} role="img" style={{width:natural.w * view.scale,height:natural.h * view.scale,transform:`translate(${view.x}px,${view.y}px)`}} />
    </div>
    <div className="gif-viewer-controls">
      <button type="button" onClick={toggle} aria-label={paused ? t('preview.videoPlay') : t('preview.videoPause')}>{paused ? '▶' : 'Ⅱ'}</button>
      <button type="button" aria-label={t("localUpgrade.previousFrame")} disabled={!count} onClick={() => {playing.current = false; setPaused(true); requested.current = (frameIndex - 1 + count) % count; wake.current();}}>◀</button>
      <input aria-label={t('preview.videoScrubAria')} type="range" min={0} max={Math.max(0,count-1)} value={frameIndex} disabled={!count} onChange={event => {playing.current=false;setPaused(true);requested.current=Number(event.target.value);wake.current();}} />
      <button type="button" aria-label={t("localUpgrade.nextFrame")} disabled={!count} onClick={() => {playing.current=false;setPaused(true);requested.current=(frameIndex+1)%count;wake.current();}}>▶</button>
      <span>{frameIndex + 1}/{count}</span><button type="button" onClick={fitToWindow}>{t('preview.fitWindow')}</button>
    </div>
  </div>;
}
