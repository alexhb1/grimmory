import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculatePublicationEraStats } from './publication-era-stats';

type PublicationEraBook = Parameters<typeof calculatePublicationEraStats>[0][number];

describe('calculatePublicationEraStats', () => {
  it('applies its sample threshold after publication dates are validated', () => {
    const stats = calculatePublicationEraStats([
      book(1, '2001'),
      book(2, 'not-a-date'),
      book(3, '1800'),
    ]);

    expect(stats.ratedBookCount).toBe(1);
    expect(stats.decades).toEqual([]);
  });

  it('uses the supplied year to validate future publication dates', () => {
    const books = [book(1, '2031'), book(2, '2031'), book(3, '2031')];

    expect(calculatePublicationEraStats(books, 2030).ratedBookCount).toBe(3);
    expect(calculatePublicationEraStats(books, 2029).ratedBookCount).toBe(0);
  });

  it('returns domain rows instead of positional chart arrays', () => {
    const stats = calculatePublicationEraStats([
      book(1, '2001'),
      book(2, '2002'),
      book(3, '2003'),
    ]);

    expect(stats.decades).toEqual([{
      startYear: 2000,
      averageRating: 8,
      ratingBands: [
        { minimumRating: 1, maximumRating: 2, bookCount: 0 },
        { minimumRating: 3, maximumRating: 4, bookCount: 0 },
        { minimumRating: 5, maximumRating: 6, bookCount: 0 },
        { minimumRating: 7, maximumRating: 8, bookCount: 3 },
        { minimumRating: 9, maximumRating: 10, bookCount: 0 },
      ],
    }]);
  });
});

function book(id: number, publishedDate: string): PublicationEraBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.READ,
    personalRating: 8,
    metadata: { bookId: id, publishedDate, allMetadataLocked: false },
  };
}
