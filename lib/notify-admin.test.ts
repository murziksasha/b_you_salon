import { describe, expect, it } from 'vitest';
import { formatBulkSummaryLine } from './notify-admin';

describe('notify-admin', () => {
  it('formats bulk summary', () => {
    const line = formatBulkSummaryLine([
      { kind: 'lead', id: 'a' },
      { kind: 'lead', id: 'b' },
      { kind: 'order', id: 'c' },
    ]);
    expect(line).toContain('3');
    expect(line).toContain('2');
    expect(line).toContain('1');
  });
});
