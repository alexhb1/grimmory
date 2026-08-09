import { describe, expect, it } from 'vitest';

import { type BookSummary } from '../../../book/data/book-response.models';
import { ReadStatus } from '../../../book/model/book.model';
import { calculateRatingTasteStats } from './rating-taste-stats';

describe('calculateRatingTasteStats', () => {
  it('normalizes personal ratings, classifies quadrants, and preserves the filename fallback', () => {
    const stats = calculateRatingTasteStats([
      book(1, 10, 2, '', 'fallback.epub'),
      book(2, 2, 4, 'Overrated'),
    ]);

    expect(stats.books).toEqual([
      expect.objectContaining({ title: 'fallback.epub', normalizedRating: 5, quadrant: 'hidden-gems' }),
      expect.objectContaining({ title: 'Overrated', normalizedRating: 1, quadrant: 'overrated' }),
    ]);
    expect(stats.profile).toBe('unique-taste');
  });

  it('ignores ratings outside their domain', () => {
    const stats = calculateRatingTasteStats([
      book(1, 11, 4, 'Invalid personal'),
      book(2, 8, 6, 'Invalid external'),
      book(3, 8, 4, 'Valid'),
    ]);

    expect(stats.totalRatedBooks).toBe(1);
    expect(stats.books[0].title).toBe('Valid');
  });
});

function book(
  id: number,
  personalRating: number,
  externalRating: number,
  title: string,
  fileName = `${id}.epub`,
): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.READ,
    personalRating,
    primaryFile: { id, bookId: id, book: true, folderBased: false, fileName },
    metadata: {
      bookId: id,
      title,
      goodreadsRating: externalRating,
      allMetadataLocked: false,
    },
  };
}
