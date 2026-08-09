import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateReadStatusStats } from './read-status-stats';

type ReadStatusBook = Parameters<typeof calculateReadStatusStats>[0][number];

describe('calculateReadStatusStats', () => {
  it('normalizes missing and unknown statuses and orders slices by count', () => {
    const stats = calculateReadStatusStats([
      book(1, ReadStatus.READ),
      book(2, ReadStatus.READ),
      book(3),
      book(4, 'FUTURE_STATUS'),
    ]);

    expect(stats.slices).toEqual([
      { status: ReadStatus.READ, bookCount: 2 },
      { status: ReadStatus.UNSET, bookCount: 2 },
    ]);
  });

  it('uses status name to resolve equal counts', () => {
    const forwards = calculateReadStatusStats([
      book(1, ReadStatus.READ),
      book(2, ReadStatus.ABANDONED),
    ]);
    const backwards = calculateReadStatusStats([
      book(2, ReadStatus.ABANDONED),
      book(1, ReadStatus.READ),
    ]);

    expect(backwards).toEqual(forwards);
    expect(forwards.slices.map(({ status }) => status)).toEqual([
      ReadStatus.ABANDONED,
      ReadStatus.READ,
    ]);
  });
});

function book(id: number, readStatus?: string): ReadStatusBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus,
  };
}
