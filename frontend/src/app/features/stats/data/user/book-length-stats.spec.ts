import { describe, expect, it } from 'vitest';

import { type BookSummary } from '../../../book/data/book-response.models';
import { ReadStatus } from '../../../book/model/book.model';
import { calculateBookLengthStats } from './book-length-stats';

describe('calculateBookLengthStats', () => {
  it('keeps the highest-rated length and linear trend used by the chart', () => {
    const stats = calculateBookLengthStats([
      book(1, 100, 4),
      book(2, 200, 6),
      book(3, 300, 8),
    ]);

    expect(stats.highestRatedLength).toBe(300);
    expect(stats.trendLine).toEqual([
      { pageCount: 100, personalRating: 4 },
      { pageCount: 300, personalRating: 8 },
    ]);
  });

  it('reports the sweet-spot range separately from the highest-rated book', () => {
    const stats = calculateBookLengthStats([
      book(1, 150, 8),
      book(2, 180, 10),
      book(3, 420, 10),
    ]);

    expect(stats.sweetSpot).toEqual({
      minimum: 101,
      maximum: 200,
      averageRating: 9,
    });
    expect(stats.highestRatedLength).toBe(180);
  });

  it('ignores invalid inputs and resolves tied ratings independently of input order', () => {
    const books = [
      book(1, 420, 10),
      book(2, 180, 10),
      book(3, 0, 8),
      book(4, 200, 0),
      book(5, 200, 11),
    ];

    const forwards = calculateBookLengthStats(books);
    const backwards = calculateBookLengthStats([...books].reverse());

    expect(forwards.totalRatedBooks).toBe(2);
    expect(forwards.highestRatedLength).toBe(180);
    expect(backwards.highestRatedLength).toBe(180);
  });
});

function book(id: number, pageCount: number, personalRating: number): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.READ,
    personalRating,
    metadata: {
      bookId: id,
      pageCount,
      allMetadataLocked: false,
    },
  };
}
