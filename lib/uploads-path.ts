import path from 'path';

/**
 * Project root for durable paths (data/, public/uploads).
 * Standalone start uses cwd = `.next/standalone` — walk up so uploads land on the
 * host tree, not a one-shot copy next to server.js.
 */
export function projectRoot(): string {
  if (process.env.PROJECT_ROOT && process.env.PROJECT_ROOT.trim()) {
    return path.resolve(process.env.PROJECT_ROOT.trim());
  }

  const cwd = process.cwd();
  const normalized = cwd.replace(/\\/g, '/');
  if (normalized.endsWith('/.next/standalone')) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

/** Absolute directory for user-uploaded images. */
export function uploadsDir(): string {
  if (process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim()) {
    return path.resolve(process.env.UPLOADS_DIR.trim());
  }
  return path.join(projectRoot(), 'public', 'uploads');
}

export function contentTypeForUploadName(name: string): string {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}
