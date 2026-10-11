import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryService, type SpawnFunction } from '../../src/worker/library-service';
import { resolveFfmpegPath } from '../../src/worker/binary-resolver';
import { importNoConflict } from './import-no-conflict';

const roots: string[] = [], services: LibraryService[] = [];
function setup(spawnFn?: SpawnFunction) {
  const root = mkdtempSync(path.join(tmpdir(), 'super-poster-upgrades-')); roots.push(root);
  const service = new LibraryService({ spawnFn }); services.push(service);
  const library = service.createLibrary({ displayName: 'Poster', selectedParentPath: root });
  return { root, service, library };
}
afterEach(async () => {
  for (const service of services.splice(0)) service.closeAll();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});
describe('25% video poster and bounded fallback', () => {
  it.skipIf(!existsSync(resolveFfmpegPath()))('decodes the real quarter-duration frame rather than the red opening frame', async () => {
    const { root, service, library } = setup(), file = path.join(root, 'red-then-blue.mp4');
    const pixels = Buffer.alloc(128 * 96 * 3 * 40);
    for (let frame = 0; frame < 40; frame++) {
      for (let pixel = 0; pixel < 128 * 96; pixel++) pixels[(frame * 128 * 96 + pixel) * 3 + (frame < 5 ? 0 : 2)] = 255;
    }
    const raw = path.join(root, 'frames.rgb'); writeFileSync(raw, pixels);
    execFileSync(resolveFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '128x96', '-framerate', '10', '-i', raw,
      '-threads', '1', '-filter_threads', '1', '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', file], { timeout: 15_000 });
    const original = readFileSync(file);
    importNoConflict(service, library.libraryId, file);
    const asset = service.listAssets({ libraryId: library.libraryId, recursive: true })[0]!;
    await service.generateThumbnail({ libraryId: library.libraryId, assetId: asset.assetId });
    const poster = service.getCurrentArtifact(library.libraryId, asset.assetId, 'video_poster');
    expect(poster?.status).toBe('ready'); expect(poster?.generatorVersion).toContain('poster25-v1');
    const stats = await sharp(path.join(library.libraryPath, '.super', 'artifacts', poster!.filePath)).stats();
    expect(stats.channels[2]!.mean).toBeGreaterThan(stats.channels[0]!.mean + 100);
    expect(readFileSync(file)).toEqual(original);
  });
  it.each(['empty', 'reject', 'exit', 'unknown', 'short'] as const)('handles %s output/duration within a two-attempt budget', async mode => {
    const attempts: string[][] = [];
    const { root, service, library } = setup(async (command, args) => {
      if (command.includes('ffprobe')) return { exitCode: 0, stderr: '', stdout: Buffer.from(JSON.stringify({
        streams: [{ codec_type: 'video', width: 64, height: 64, codec_name: 'h264', r_frame_rate: '30/1' }],
        format: { duration: mode === 'unknown' ? 'N/A' : mode === 'short' ? '0.04' : '4' },
      })) };
      if (args.at(-1)?.endsWith('.jpg')) {
        attempts.push(args);
        if (args.includes('-ss') && mode === 'reject') throw Error('decoder seek failed');
        if (args.includes('-ss') && mode === 'exit') return { exitCode: 1, stderr: 'seek failed', stdout: Buffer.alloc(0) };
        writeFileSync(args.at(-1)!, args.includes('-ss') && mode === 'empty' ? Buffer.alloc(0) : Buffer.from('fixture'));
      }
      return { exitCode: 0, stderr: '', stdout: Buffer.alloc(0) };
    });
    const file = path.join(root, 'video.mp4'); writeFileSync(file, Buffer.alloc(100));
    importNoConflict(service, library.libraryId, file);
    const asset = service.listAssets({ libraryId: library.libraryId, recursive: true })[0]!;
    await service.generateThumbnail({ libraryId: library.libraryId, assetId: asset.assetId });
    expect(service.getCurrentArtifact(library.libraryId, asset.assetId, 'video_poster')?.status).toBe('ready');
    expect(attempts).toHaveLength(mode === 'unknown' || mode === 'short' ? 1 : 2);
    if (mode === 'short') expect(attempts[0]![attempts[0]!.indexOf('-ss') + 1]).toBe('0.01');
    if (mode !== 'short') expect(attempts.at(-1)).not.toContain('-ss');
  });
});
