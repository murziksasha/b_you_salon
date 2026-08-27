import { describe, expect, it } from 'vitest';
import { moveByDir, reorderItems } from './reorder';

describe('reorderItems', () => {
  it('moves item forward and backward', () => {
    expect(reorderItems(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reorderItems(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('no-ops on same index or out of range', () => {
    expect(reorderItems(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(reorderItems(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
    expect(reorderItems(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('moveByDir', () => {
  it('shifts by one', () => {
    expect(moveByDir(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveByDir(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });
});
