import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateLibrarySummaryStats } from './library-summary-stats';

type LibrarySummaryBook = Parameters<typeof calculateLibrarySummaryStats>[0][number];

describe('calculateLibrarySummaryStats', () => {
  it('summarizes the selected paginated books without counting duplicate metadata', () => {
    const books: LibrarySummaryBook[] = [
      book(1, 1024, ['Ada', ' Bob '], 'Series', 'Publisher'),
      book(2, 512, ['Ada'], 'Series', 'Publisher'),
    ];

    expect(calculateLibrarySummaryStats(books)).toEqual({
      totalBooks: 2,
      totalSizeKb: 1536,
      totalAuthors: 2,
      totalSeries: 1,
      totalPublishers: 1,
    });
  });
});

function book(
  id: number,
  fileSizeKb: number,
  authors: string[],
  seriesName: string,
  publisher: string,
): LibrarySummaryBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.UNREAD,
    primaryFile: { fileSizeKb } as LibrarySummaryBook['primaryFile'],
    metadata: {
      bookId: id,
      authors,
      seriesName,
      publisher,
      allMetadataLocked: false,
    },
  };
}
