import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculatePublicationTrendStats } from './publication-trend-stats';

type PublicationTrendBook = Parameters<typeof calculatePublicationTrendStats>[0][number];

describe('calculatePublicationTrendStats', () => {
  const currentDate = new Date('2026-06-15T12:00:00Z');

  it('returns the empty contract when no publication years are usable', () => {
    expect(calculatePublicationTrendStats([], currentDate)).toEqual({
      totalBooks: 0,
      firstYear: null,
      lastYear: null,
      years: [],
      insights: null,
    });
  });

  it('groups duplicate years, sorts them, and fills gaps across the represented range', () => {
    const stats = calculatePublicationTrendStats(
      [book(1, '2002'), book(2, '1999'), book(3, '1999'), book(4, '2001')],
      currentDate,
    );

    expect(stats.totalBooks).toBe(4);
    expect(stats.firstYear).toBe(1999);
    expect(stats.lastYear).toBe(2002);
    expect(stats.years).toEqual([
      { year: 1999, bookCount: 2 },
      { year: 2000, bookCount: 0 },
      { year: 2001, bookCount: 1 },
      { year: 2002, bookCount: 1 },
    ]);
  });

  it('chooses the earliest year when the peak count is tied', () => {
    const stats = calculatePublicationTrendStats(
      [book(1, '2010'), book(2, '2010'), book(3, '2012'), book(4, '2012')],
      currentDate,
    );

    expect(stats.insights?.peakYear).toEqual({ year: 2010, bookCount: 2 });
  });

  it('uses inclusive five-year windows and keeps the earliest window on a tie', () => {
    const stats = calculatePublicationTrendStats(
      [book(1, '2000'), book(2, '2000'), book(3, '2004'), book(4, '2005'), book(5, '2005')],
      currentDate,
    );

    expect(stats.insights?.busiestSpan).toEqual({
      startYear: 2000,
      endYear: 2004,
      bookCount: 3,
    });
  });

  it('counts the current year and nine preceding years as the last ten years', () => {
    const stats = calculatePublicationTrendStats(
      [book(1, '2016'), book(2, '2017'), book(3, '2026'), book(4, '2027')],
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(stats.insights?.recentBookCount).toBe(2);
    expect(stats.insights?.recentPercent).toBe(50);
  });

  it('accepts the next publication year but excludes malformed, implausible, and later dates', () => {
    const stats = calculatePublicationTrendStats(
      [
        book(1, '2025-03-20T10:00:00Z'),
        book(2, '2027'),
        book(3, '2028'),
        book(4, '2026/03/20'),
        book(5, '0999'),
        book(6, undefined),
      ],
      currentDate,
    );

    expect(stats.totalBooks).toBe(2);
    expect(stats.years).toEqual([
      { year: 2025, bookCount: 1 },
      { year: 2026, bookCount: 0 },
      { year: 2027, bookCount: 1 },
    ]);
    expect(stats.insights?.recentBookCount).toBe(1);
  });

  it('reports the complete insight contract from active years only', () => {
    const stats = calculatePublicationTrendStats(
      [
        book(1, '1960'),
        book(2, '1960'),
        book(3, '1969'),
        book(4, '1970'),
        book(5, '1999'),
        book(6, '2000'),
        book(7, '2000'),
        book(8, '2025'),
        book(9, '2025'),
        book(10, '2025'),
        book(11, '2026'),
      ],
      currentDate,
    );

    expect(stats.insights).toEqual({
      peakYear: { year: 2025, bookCount: 3 },
      recentBookCount: 4,
      recentPercent: 36,
      averageBooksPerActiveYear: 1.6,
      busiestSpan: { startYear: 2025, endYear: 2029, bookCount: 4 },
      yearSpan: 66,
      activeYearCount: 7,
      classicBookCount: 3,
      classicPercent: 27,
      modernBookCount: 6,
      modernPercent: 55,
    });
  });
});

function book(id: number, publishedDate: string | undefined): PublicationTrendBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.UNREAD,
    metadata: {
      bookId: id,
      publishedDate,
      allMetadataLocked: false,
    },
  };
}
