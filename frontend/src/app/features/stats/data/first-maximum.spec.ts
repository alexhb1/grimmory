import { describe, expect, it } from 'vitest';

import { firstMaximumBy } from './first-maximum';

describe('firstMaximumBy', () => {
  it('returns null for an empty collection', () => {
    expect(firstMaximumBy([], () => 0)).toBeNull();
  });

  it('returns the entry with the highest score', () => {
    const entries = [
      { name: 'low', score: -10 },
      { name: 'high', score: 5 },
      { name: 'middle', score: 0 },
    ];

    expect(firstMaximumBy(entries, (entry) => entry.score)).toBe(entries[1]);
  });

  it('keeps the first entry when the highest score is tied', () => {
    const entries = [
      { name: 'first', score: 5 },
      { name: 'second', score: 5 },
    ];

    expect(firstMaximumBy(entries, (entry) => entry.score)).toBe(entries[0]);
  });
});
