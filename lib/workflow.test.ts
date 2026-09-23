import { describe, expect, it } from 'vitest';
import {
  defaultOutcomeForStatus,
  handledFromStatus,
  isOpenStatus,
  isStaleOpen,
  isVeryStaleOpen,
  normalizeStatus,
  resolveCloseOutcome,
  statusBadgeClass,
  statusFromHandled,
  statusRequiresOutcome,
  validateClosePatch,
  type WorkflowStatus,
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

  it('very stale detection (24h+)', () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();

    expect(isVeryStaleOpen(twentyFiveHoursAgo, 'new')).toBe(true);
    expect(isVeryStaleOpen(tenHoursAgo, 'new')).toBe(false);
    expect(isVeryStaleOpen(twentyFiveHoursAgo, 'done')).toBe(false);
  });

  it('returns appropriate badge class for each status', () => {
    const statuses: WorkflowStatus[] = ['new', 'called', 'waiting', 'in_progress', 'done', 'spam', 'no_answer'];
    for (const st of statuses) {
      const cls = statusBadgeClass(st);
      expect(cls).toContain('admin-wf-badge');
    }
    expect(statusBadgeClass('new')).toBe('admin-wf-badge admin-wf-badge--new');
    expect(statusBadgeClass('called')).toBe('admin-wf-badge admin-wf-badge--called');
    expect(statusBadgeClass('waiting')).toBe('admin-wf-badge admin-wf-badge--waiting');
    expect(statusBadgeClass('in_progress')).toBe('admin-wf-badge admin-wf-badge--called');
    expect(statusBadgeClass('done')).toBe('admin-wf-badge admin-wf-badge--done');
    expect(statusBadgeClass('spam')).toBe('admin-wf-badge admin-wf-badge--spam');
    expect(statusBadgeClass('no_answer')).toBe('admin-wf-badge admin-wf-badge--no-answer');
    expect(statusBadgeClass('unknown' as unknown as WorkflowStatus)).toBe('admin-wf-badge');
  });

  it('close requires outcome, note is optional', () => {
    expect(statusRequiresOutcome('done')).toBe(true);
    expect(validateClosePatch({ status: 'done' })).toMatch(/outcome/i);
    expect(validateClosePatch({ status: 'done', outcome: 'deal' })).toBeNull();
    expect(validateClosePatch({ status: 'done', outcome: 'deal', note: 'ok' })).toBeNull();
    expect(validateClosePatch({ status: 'called' })).toBeNull();
  });

  it('default and resolve close outcome', () => {
    expect(defaultOutcomeForStatus('done')).toBe('deal');
    expect(defaultOutcomeForStatus('spam')).toBe('spam');
    expect(defaultOutcomeForStatus('no_answer')).toBe('no_answer');
    expect(defaultOutcomeForStatus('called')).toBeUndefined();
    expect(resolveCloseOutcome('done')).toBe('deal');
    expect(resolveCloseOutcome('done', 'refused')).toBe('refused');
    expect(resolveCloseOutcome('done', 'nope')).toBe('deal');
    expect(resolveCloseOutcome('called')).toBeUndefined();
  });
});
