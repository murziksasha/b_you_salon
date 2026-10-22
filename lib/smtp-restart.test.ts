import path from 'path';
import { describe, expect, it } from 'vitest';
import { byouCwdsFromJlist, decidePm2Restart, execCwdsFromPm2Describe } from './smtp-restart';

const root = path.resolve('F:/apps/byou-dev');

describe('decidePm2Restart', () => {
  it('refuses when pm2 is missing', () => {
    const decision = decidePm2Restart({
      projectRoot: root,
      pm2Missing: true,
      describeCwds: [],
      jlistCwds: null,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.status).toBe(500);
      expect(decision.error).toMatch(/pm2 не знайдено/);
    }
  });

  it('refuses a byou process whose cwd is another project', () => {
    const other = path.resolve('F:/apps/byou-prod');
    const decision = decidePm2Restart({
      projectRoot: root,
      describeCwds: [other],
      jlistCwds: [other],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error).toMatch(/іншого каталогу/);
  });

  it('allows a matching cwd and ignores a truncated describe cell when jlist is exact', () => {
    const decision = decidePm2Restart({
      projectRoot: root,
      describeCwds: ['F:\\apps\\byou-de…'],
      jlistCwds: [root],
    });
    expect(decision).toEqual({ ok: true, root });
  });

  it('refuses a truncated describe when jlist cannot prove the cwd', () => {
    const decision = decidePm2Restart({
      projectRoot: root,
      describeCwds: ['F:\\apps\\byou-de…'],
      jlistCwds: null,
    });
    expect(decision.ok).toBe(false);
  });
});

describe('pm2 output parsers', () => {
  it('reads exec cwd from a describe table', () => {
    const stdout = [
      '┌───────────────────┬──────────────────────────────────┐',
      '│ exec cwd          │ F:\\SSD PROJECT\\b_you_salon      │',
      '└───────────────────┴──────────────────────────────────┘',
    ].join('\n');
    expect(execCwdsFromPm2Describe(stdout)).toEqual(['F:\\SSD PROJECT\\b_you_salon']);
  });

  it('reads only the byou cwd from jlist and ignores the rest of the env', () => {
    const stdout = `warning\n${JSON.stringify([
      { name: 'other', pm2_env: { pm_cwd: 'F:/elsewhere', SMTP_PASS: 'nope' } },
      { name: 'byou', pm2_env: { pm_cwd: 'F:/apps/byou-dev', SMTP_PASS: 'secret' } },
    ])}`;
    expect(byouCwdsFromJlist(stdout)).toEqual(['F:/apps/byou-dev']);
  });
});
