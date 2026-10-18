import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'public', 'img', 'hero', 'interior.jpg');
const logo = path.join(root, 'public', 'img', 'icons', 'logo.jpg');
const out = path.join(root, 'public', 'img', 'og-cover.jpg');

const overlay = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0d0d0d" stop-opacity="0.88"/>
      <stop offset="0.52" stop-color="#0d0d0d" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#0d0d0d" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="72" y="340" font-family="Georgia, 'Times New Roman', serif" font-size="92" fill="#f3d6c8">B_You</text>
  <text x="72" y="400" font-family="Arial, 'Segoe UI', sans-serif" font-size="30" fill="#f6efe6">Студія краси · салон і магазин</text>
</svg>`);

const logoBuf = await sharp(logo).resize(120, 120, { fit: 'cover' }).png().toBuffer();

await sharp(src)
  .resize(1200, 630, { fit: 'cover', position: 'centre' })
  .composite([
    { input: overlay, top: 0, left: 0 },
    { input: logoBuf, top: 48, left: 72 },
  ])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(out);

const meta = await sharp(out).metadata();
console.log('og-cover', meta.width, meta.height, meta.size);
