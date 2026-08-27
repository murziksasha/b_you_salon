import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { contentTypeForUploadName, projectRoot, uploadsDir } from './uploads-path';

describe('uploads-path', () => {
  const prev = {
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    PROJECT_ROOT: process.env.PROJECT_ROOT,
  };

  afterEach(() => {
    if (prev.UPLOADS_DIR === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prev.UPLOADS_DIR;
    if (prev.PROJECT_ROOT === undefined) delete process.env.PROJECT_ROOT;
    else process.env.PROJECT_ROOT = prev.PROJECT_ROOT;
  });

  it('respects UPLOADS_DIR', () => {
    process.env.UPLOADS_DIR = path.join('/tmp', 'ps-uploads-test');
    expect(uploadsDir()).toBe(path.resolve('/tmp', 'ps-uploads-test'));
  });

  it('respects PROJECT_ROOT for default uploads', () => {
    delete process.env.UPLOADS_DIR;
    process.env.PROJECT_ROOT = path.join('/tmp', 'ps-root');
    expect(uploadsDir()).toBe(path.join(path.resolve('/tmp', 'ps-root'), 'public', 'uploads'));
    expect(projectRoot()).toBe(path.resolve('/tmp', 'ps-root'));
  });

  it('maps content types', () => {
    expect(contentTypeForUploadName('a.webp')).toBe('image/webp');
    expect(contentTypeForUploadName('a.PNG')).toBe('image/png');
    expect(contentTypeForUploadName('a.bin')).toBe('application/octet-stream');
  });
});
