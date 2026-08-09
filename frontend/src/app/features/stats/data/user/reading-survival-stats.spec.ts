import { describe, expect, it } from 'vitest';

import { type BookSummary } from '../../../book/data/book-response.models';
import { ReadStatus } from '../../../book/model/book.model';
import { calculateReadingSurvivalStats } from './reading-survival-stats';

describe('calculateReadingSurvivalStats', () => {
  it('finds the largest dropout interval', () => {
    const stats = calculateReadingSurvivalStats([10, 25, 25, 100].map(book));

    expect(stats.totalStarted).toBe(4);
    expect(stats.dangerZone).toEqual({ from: 25, to: 50, dropPercent: 50 });
    expect(stats.medianDropout).toEqual({ from: 25, to: 50 });
  });

  it('returns no danger zone when every started book is completed', () => {
    const stats = calculateReadingSurvivalStats([100, 100].map(book));

    expect(stats.completionRate).toBe(100);
    expect(stats.dangerZone).toBeNull();
    expect(stats.medianDropout).toBeNull();
  });
});

function book(progress: number, index: number): BookSummary {
  return {
    id: index + 1,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: progress === 100 ? ReadStatus.READ : ReadStatus.READING,
    epubProgress: {
      cfi: null,
      href: null,
      contentSourceProgressPercent: null,
      percentage: progress,
      ttsPositionCfi: null,
    },
  };
}
