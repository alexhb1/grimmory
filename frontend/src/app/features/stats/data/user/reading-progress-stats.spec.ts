import { describe, expect, it } from 'vitest';

import { type BookSummary } from '../../../book/data/book-response.models';
import { ReadStatus } from '../../../book/model/book.model';
import { calculateReadingProgressStats } from './reading-progress-stats';

describe('calculateReadingProgressStats', () => {
  it('places decimal progress values into contiguous bands', () => {
    const stats = calculateReadingProgressStats(
      [0, 0.1, 25.5, 50.5, 75.5, 99.5, 99.99, 100].map(book),
    );

    expect(stats.totalBooks).toBe(8);
    expect(stats.bands.map(({ bookCount }) => bookCount)).toEqual([1, 1, 1, 1, 3, 1]);
  });
});

function book(progress: number, index: number): BookSummary {
  return {
    id: index + 1,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.READING,
    epubProgress: {
      cfi: null,
      href: null,
      contentSourceProgressPercent: null,
      percentage: progress,
      ttsPositionCfi: null,
    },
  };
}
