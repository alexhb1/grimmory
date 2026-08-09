import { describe, expect, it } from 'vitest';

import { calculatePageCountStats } from './page-count-stats';

describe('calculatePageCountStats', () => {
  it('returns the actual bounds for the open-ended bucket', () => {
    const bucket = calculatePageCountStats([{
      id: 1,
      libraryId: 1,
      libraryName: 'Library',
      metadata: { bookId: 1, allMetadataLocked: false, pageCount: 1001 },
    }]).buckets.find(({ id }) => id === 'over-1000');

    expect(bucket).toEqual({
      id: 'over-1000',
      minimum: 1001,
      maximum: null,
      bookCount: 1,
    });
  });

  it('ignores non-positive page counts', () => {
    const stats = calculatePageCountStats([
      book(1, 0),
      book(2, -1),
      book(3, 250),
    ]);

    expect(stats.totalBooks).toBe(1);
    expect(stats.buckets.find(({ id }) => id === '201-to-300')?.bookCount).toBe(1);
    expect(stats.buckets.find(({ id }) => id === 'over-1000')?.bookCount).toBe(0);
  });
});

function book(id: number, pageCount: number) {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    metadata: { bookId: id, allMetadataLocked: false, pageCount },
  };
}
