import { describe, expect, it } from 'vitest';
import { mergeEnvText, readMailValues, toPublicMailConfig } from './env-file';

const SOURCE = [
  '# mail setup',
  'SMTP_HOST=smtp.gmail.com',
  'SMTP_PORT=465',
  'SMTP_USER=old@example.com',
  'SMTP_PASS=super-secret',
  'MAIL_FROM=old@example.com',
  'MAIL_TO=inbox@example.com',
  '',
  '# keep me',
  'ADMIN_PASSWORD=changeme',
  'SESSION_SECRET=not-a-real-secret',
  'TELEGRAM_BOT_TOKEN=123:abc',
  '# SMTP_PASS=do-not-touch',
  '',
].join('\n');

describe('mergeEnvText', () => {
  it('keeps comments and unrelated secrets and does not wipe an omitted password', () => {
    const next = mergeEnvText(SOURCE, {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'new@example.com',
      MAIL_FROM: 'B You <new@example.com>',
      MAIL_TO: 'owner@example.com',
    });

    expect(next).toContain('# mail setup');
    expect(next).toContain('# keep me');
    expect(next).toContain('# SMTP_PASS=do-not-touch');
    expect(next).toContain('ADMIN_PASSWORD=changeme');
    expect(next).toContain('SESSION_SECRET=not-a-real-secret');
    expect(next).toContain('TELEGRAM_BOT_TOKEN=123:abc');
    expect(next).toContain('SMTP_PASS=super-secret');
    expect(next).not.toMatch(/^SMTP_PASS=$/m);
    expect(next).toContain('SMTP_HOST=smtp.example.com');
    expect(next).toContain('SMTP_PORT=587');
    expect(next).toContain('SMTP_USER=new@example.com');
    expect(next).toContain("MAIL_FROM='B You <new@example.com>'");
    expect(next).toContain('MAIL_TO=owner@example.com');
    expect(readMailValues(next).SMTP_PASS).toBe('super-secret');
    expect(readMailValues(next).MAIL_FROM).toBe('B You <new@example.com>');
  });

  it('appends missing mail keys without dropping a later secret', () => {
    const source = 'ADMIN_PASSWORD=keep\n# note\n';
    const next = mergeEnvText(source, {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      MAIL_TO: 'owner@example.com',
    });
    expect(next.startsWith('ADMIN_PASSWORD=keep\n# note\n')).toBe(true);
    expect(next).toContain('SMTP_HOST=smtp.example.com');
    expect(next).toContain('SMTP_PORT=465');
    expect(next).toContain('MAIL_TO=owner@example.com');
    expect(next).not.toContain('SMTP_PASS');
    expect(readMailValues(next).SMTP_PASS).toBe('');
  });

  it('writes an empty password only when the patch says so', () => {
    const next = mergeEnvText(SOURCE, { SMTP_PASS: '' });
    expect(next).toContain('SMTP_PASS=');
    expect(next).not.toContain('SMTP_PASS=super-secret');
    expect(next).toContain('ADMIN_PASSWORD=changeme');
    expect(readMailValues(next).SMTP_PASS).toBe('');
    expect(readMailValues(next).SMTP_HOST).toBe('smtp.gmail.com');
  });

  it('preserves CRLF and updates every assignment of a patched key', () => {
    const source = 'SMTP_HOST=one\r\n# mid\r\nSMTP_HOST=two\r\nSESSION_SECRET=abc\r\n';
    const next = mergeEnvText(source, { SMTP_HOST: 'three' });
    expect(next).toBe('SMTP_HOST=three\r\n# mid\r\nSMTP_HOST=three\r\nSESSION_SECRET=abc\r\n');
    expect(readMailValues(next).SMTP_HOST).toBe('three');
  });
});

describe('toPublicMailConfig', () => {
  it('hides the password and flags a restart when the file differs from the process', () => {
    const values = readMailValues(SOURCE);
    const pub = toPublicMailConfig(values, {
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_USER: 'old@example.com',
      SMTP_PASS: 'super-secret',
      MAIL_FROM: 'old@example.com',
      MAIL_TO: 'other@example.com',
    });
    expect(pub).toEqual({
      host: 'smtp.gmail.com',
      port: '465',
      user: 'old@example.com',
      from: 'old@example.com',
      to: 'inbox@example.com',
      hasPassword: true,
      pendingRestart: true,
    });
    expect(JSON.stringify(pub)).not.toContain('super-secret');
  });
});
