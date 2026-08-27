/**
 * Production start for Next.js output: 'standalone'.
 * Copies static assets if needed and runs node server.js
 *
 * Uploads always live in the project tree `public/uploads` (or UPLOADS_DIR).
 * We do NOT copy uploads into the standalone snapshot so runtime writes stay durable
 * and `app/uploads/[name]` can serve them without a process restart.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, symlinkSync, rmSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');
const serverJs = path.join(standalone, 'server.js');

if (!existsSync(serverJs)) {
  console.error('Missing .next/standalone/server.js — run: npm run build');
  process.exit(1);
}

// Ensure static files are available next to standalone server
const staticSrc = path.join(root, '.next', 'static');
const staticDest = path.join(standalone, '.next', 'static');
const publicSrc = path.join(root, 'public');
const publicDest = path.join(standalone, 'public');
const uploadsSrc = path.join(root, 'public', 'uploads');
const uploadsDest = path.join(standalone, 'public', 'uploads');

if (existsSync(staticSrc)) {
  mkdirSync(path.dirname(staticDest), { recursive: true });
  cpSync(staticSrc, staticDest, { recursive: true });
}

if (existsSync(publicSrc)) {
  mkdirSync(publicDest, { recursive: true });
  for (const entry of readdirSync(publicSrc)) {
    if (entry === 'uploads') continue;
    const from = path.join(publicSrc, entry);
    const to = path.join(publicDest, entry);
    cpSync(from, to, { recursive: true });
  }
}

mkdirSync(uploadsSrc, { recursive: true });

// Prefer a junction/symlink so static middleware also sees live uploads when present.
// Route handler app/uploads/[name] still serves from UPLOADS_DIR as fallback.
function linkUploads() {
  try {
    if (existsSync(uploadsDest)) {
      const st = statSync(uploadsDest);
      // If it's already a symlink/junction, leave it; if a real dir with files, replace carefully
      try {
        rmSync(uploadsDest, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    mkdirSync(path.dirname(uploadsDest), { recursive: true });
    // 'junction' works on Windows without admin; falls back to 'dir' symlink on POSIX
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    symlinkSync(uploadsSrc, uploadsDest, type);
    console.log(`[start-standalone] linked uploads: ${uploadsDest} -> ${uploadsSrc}`);
  } catch (err) {
    console.warn(
      '[start-standalone] could not link uploads (Route Handler will still serve UPLOADS_DIR):',
      err && err.message ? err.message : err,
    );
    mkdirSync(uploadsDest, { recursive: true });
  }
}

linkUploads();

const port = process.env.PORT || '3000';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const uploadsDirEnv = process.env.UPLOADS_DIR || uploadsSrc;

const child = spawn(process.execPath, ['server.js'], {
  cwd: standalone,
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: hostname,
    PROJECT_ROOT: root,
    UPLOADS_DIR: uploadsDirEnv,
  },
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
