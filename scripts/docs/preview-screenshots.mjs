/** Render contact sheets for reviewing every image without altering originals. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'docs/assets/ui/live-2.3.17');
const output = path.join(root, 'tmp/docs-audit');
fs.mkdirSync(output, { recursive: true });
const files = fs.readdirSync(source).filter(name => name.endsWith('.png')).sort();
for (let offset = 0; offset < files.length; offset += 8) {
  const composites = [];
  for (const [index, file] of files.slice(offset, offset + 8).entries()) {
    const x = index % 2 * 640, y = Math.floor(index / 2) * 448;
    const thumbnail = await sharp(path.join(source, file)).resize(620, 410, { fit: 'contain', background: '#ddd' }).png().toBuffer();
    composites.push({ input: thumbnail, left: x + 10, top: y + 28 });
    const label = Buffer.from(`<svg width="620" height="24"><text x="8" y="18" font-family="Arial" font-size="16">${file}</text></svg>`);
    composites.push({ input: label, left: x + 10, top: y + 2 });
  }
  const target = path.join(output, `contact-${offset / 8 + 1}.png`);
  await sharp({ create: { width: 1280, height: 1792, channels: 3, background: '#eee' } }).composite(composites).png().toFile(target);
  console.log(path.relative(root, target));
}
