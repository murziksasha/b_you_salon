import { describe, expect, it } from 'vitest';
import {
  handledFromStatus,
  isOpenStatus,
  isStaleOpen,
  normalizeStatus,
  statusFromHandled,
  statusRequiresOutcome,
  validateClosePatch,
} from './workflow';

describe('workflow', () => {
  it('derives status from handled', () => {
    expect(statusFromHandled(false)).toBe('new');
    expect(statusFromHandled(true)).toBe('done');
  });

  it('normalizes missing status', () => {
    expect(normalizeStatus(undefined, false)).toBe('new');
    expect(normalizeStatus(undefined, true)).toBe('done');
    expect(normalizeStatus('waiting', false)).toBe('waiting');
    expect(normalizeStatus('in_progress', false)).toBe('in_progress');
  });

  it('maps closed statuses to handled', () => {
    expect(handledFromStatus('done')).toBe(true);
    expect(handledFromStatus('spam')).toBe(true);
    expect(handledFromStatus('new')).toBe(false);
    expect(handledFromStatus('in_progress')).toBe(false);
  });

  it('open status set includes in_progress', () => {
    expect(isOpenStatus('new')).toBe(true);
    expect(isOpenStatus('in_progress')).toBe(true);
    expect(isOpenStatus('done')).toBe(false);
  });

  it('stale detection', () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(isStaleOpen(old, 'new')).toBe(true);
    expect(isStaleOpen(old, 'done')).toBe(false);
  });

  it('close requires outcome + note', () => {
    expect(statusRequiresOutcome('done')).toBe(true);
    expect(validateClosePatch({ status: 'done' })).toMatch(/outcome/i);
    expect(validateClosePatch({ status: 'done', outcome: 'deal' })).toMatch(/номат|нотать|нотат/i);
    expect(validateClosePatch({ status: 'done', outcome: 'deal', note: 'ok' })).toBeNull();
    expect(validateClosePatch({ status: 'called' })).toBeNull();
  });
});
