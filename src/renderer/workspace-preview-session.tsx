import { createContext, useContext, useEffect, type MutableRefObject } from 'react';
import type { ViewerDisplayTransform } from './viewer-display-transform';
export interface WorkspacePreviewSession {
  transform?: ViewerDisplayTransform;
  viewport?: {natural: {w: number; h: number}; view: {x: number; y: number; scale: number}};
  media?: {time: number; rate: number};
}
/** This object is an external, session-only bookmark store, not React UI state. */
export function saveWorkspaceViewport(session: WorkspacePreviewSession | null, viewport: NonNullable<WorkspacePreviewSession['viewport']>) {
  if (session) session.viewport = viewport;
}
export const WorkspacePreviewContext = createContext<WorkspacePreviewSession | null>(null);
export const useWorkspacePreviewSession = () => useContext(WorkspacePreviewContext);

/** Inactive previews unmount and stop playing; only their small bookmark survives. */
export function useWorkspaceMediaBookmark<T extends HTMLMediaElement>(ref: MutableRefObject<T | null>, src: string) {
  const session = useWorkspacePreviewSession();
  useEffect(() => {
    const media = ref.current; if (!media || !session) return;
    const restore = () => {
      if (!session.media) return;
      if (Number.isFinite(media.duration) && media.duration > 0) media.currentTime = Math.min(session.media.time, media.duration);
      media.playbackRate = session.media.rate;
    };
    const save = () => {
      if (Number.isFinite(media.currentTime)) session.media = {time: media.currentTime, rate: media.playbackRate};
    };
    media.addEventListener('loadedmetadata', restore);
    media.addEventListener('timeupdate', save);
    media.addEventListener('ratechange', save);
    media.addEventListener('pause', save);
    if (media.readyState >= 1) restore();
    return () => {
      save();
      media.removeEventListener('loadedmetadata', restore);
      media.removeEventListener('timeupdate', save);
      media.removeEventListener('ratechange', save);
      media.removeEventListener('pause', save);
    };
  }, [ref, session, src]);
}
