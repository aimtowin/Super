/** Prefer the frame at one quarter of the video, not the frequently black intro. */
export function videoPosterSeekSeconds(durationMs: number | null | undefined): number {
  return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0
    ? durationMs / 4_000
    : 0;
}
