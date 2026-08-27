/**
 * Reprocess public/uploads with current optimize rules (PNG stays PNG, JPEG→WebP).
 * Updates data/site.json URL references when a file extension changes.
 *
 * Usage: node scripts/reprocess-uploads.mjs
 *        node scripts/reprocess-uploads.mjs --dry-run
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Prefer compiled path if needed; use dynamic import of TS via tsx when available.
// This script uses sharp directly with the same rules as lib/image-optimize.ts

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const uploads = path.join(root, 'public', 'uploads');
const siteJsonPath = path.join(root, 'data', 'site.json');
const dryRun = process.argv.includes('--dry-run');

const MAX_EDGE = 1920;
const WEBP_QUALITY = 82;
const PNG_MAX_EDGE_KEEP = 2400;

async function optimizeImageUpload(input, sourceExt) {
  const ext = sourceExt.toLowerCase();
  if (ext === '.gif') {
    return { buffer: input, ext: '.gif', contentType: 'image/gif', optimized: false };
  }
  try {
    let pipeline = sharp(input, { failOn: 'none' }).rotate();
    const meta = await pipeline.metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    const needsResize = w > MAX_EDGE || h > MAX_EDGE;
    if (needsResize) {
      pipeline = pipeline.resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    if (ext === '.png') {
      const maxEdge = Math.max(w, h);
      if (!needsResize && maxEdge > 0 && maxEdge <= PNG_MAX_EDGE_KEEP && input.length < 1.5 * 1024 * 1024) {
        const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        if (buffer.length < input.length * 0.98) {
          return { buffer, ext: '.png', contentType: 'image/png', optimized: true };
        }
        return { buffer: input, ext: '.png', contentType: 'image/png', optimized: false };
      }
      const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      return { buffer, ext: '.png', contentType: 'image/png', optimized: true };
    }
    if (ext === '.webp') {
      // Prefer PNG when alpha present (logos that were wrongly converted)
      const hasAlpha = Boolean(meta.hasAlpha);
      if (hasAlpha) {
        const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        return { buffer, ext: '.png', contentType: 'image/png', optimized: true };
      }
      const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
      return { buffer, ext: '.webp', contentType: 'image/webp', optimized: true };
    }
    const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    return { buffer, ext: '.webp', contentType: 'image/webp', optimized: true };
  } catch (err) {
    console.error('sharp failed for', sourceExt, err.message);
    return { buffer: input, ext, contentType: 'application/octet-stream', optimized: false };
  }
}

function replaceUrls(text, map) {
  let out = text;
  for (const [from, to] of map) {
    if (from === to) continue;
    out = out.split(from).join(to);
  }
  return out;
}

async function main() {
  let names;
  try {
    names = await fs.readdir(uploads);
  } catch {
    console.log('No uploads directory');
    return;
  }

  const renames = [];
  let processed = 0;
  let skipped = 0;

  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(uploads, name);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;

    const ext = path.extname(name).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
      skipped++;
      continue;
    }

    const input = await fs.readFile(full);
    const sourceExt = ext === '.jpeg' ? '.jpg' : ext;
    const result = await optimizeImageUpload(input, sourceExt);
    const base = name.slice(0, name.length - ext.length);
    const newName = `${base}${result.ext}`;
    const newFull = path.join(uploads, newName);
    const oldUrl = `/uploads/${name}`;
    const newUrl = `/uploads/${newName}`;

    if (dryRun) {
      console.log(`[dry-run] ${name} → ${newName} (optimized=${result.optimized}, ${result.buffer.length}b)`);
      if (name !== newName) renames.push([oldUrl, newUrl]);
      processed++;
      continue;
    }

    if (name === newName) {
      if (result.optimized && !result.buffer.equals(input)) {
        await fs.writeFile(full, result.buffer);
        console.log(`updated ${name}`);
      } else {
        console.log(`kept ${name}`);
      }
    } else {
      await fs.writeFile(newFull, result.buffer);
      await fs.unlink(full);
      renames.push([oldUrl, newUrl]);
      console.log(`renamed ${name} → ${newName}`);
    }
    processed++;
  }

  if (renames.length) {
    try {
      const raw = await fs.readFile(siteJsonPath, 'utf8');
      const next = replaceUrls(raw, renames);
      if (next !== raw) {
        if (dryRun) {
          console.log(`[dry-run] would update site.json (${renames.length} path(s))`);
        } else {
          await fs.writeFile(siteJsonPath, next, 'utf8');
          console.log(`updated site.json (${renames.length} path(s))`);
        }
      }
    } catch (err) {
      console.error('site.json update failed:', err.message);
    }
  }

  console.log(`Done. processed=${processed} skipped=${skipped} renames=${renames.length} dryRun=${dryRun}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
