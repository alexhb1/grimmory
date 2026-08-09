import { describe, expect, it } from 'vitest';

import { type BookSummary } from '../../../book/data/book-response.models';
import { ReadStatus } from '../../../book/model/book.model';
import { calculateReadingJourneyStats } from './reading-journey-stats';

describe('reading journey stats', () => {
  it('groups events into the month shown in the reader timezone', () => {
    const books: BookSummary[] = [{
      id: 1,
      libraryId: 1,
      libraryName: 'Test',
      addedOn: '2026-01-01T03:30:00Z',
      readStatus: ReadStatus.UNREAD,
    }];

    const result = calculateReadingJourneyStats(books, new Date(), 'America/New_York');

    expect(result.months).toEqual([{
      month: '2025-12',
      cumulativeAdded: 1,
      cumulativeFinished: 0,
      backlog: 1,
    }]);
  });

  it('uses exactly three inclusive calendar months for recent activity', () => {
    const result = calculateReadingJourneyStats(
      [
        book(1, '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z'),
        book(2, '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'),
      ],
      new Date('2026-08-09T00:00:00Z'),
      'UTC',
    );

    expect(result.insights?.recentFinishedCount).toBe(1);
  });

  it('uses null when no finished book has a valid elapsed-time sample', () => {
    const result = calculateReadingJourneyStats(
      [book(1, '2026-06-02T00:00:00Z', '2026-06-01T00:00:00Z')],
      new Date('2026-08-09T00:00:00Z'),
      'UTC',
    );

    expect(result.insights?.averageDaysToFinish).toBeNull();
    expect(result.insights?.totalFinished).toBe(1);
  });

  it('averages exact elapsed time before rounding to days', () => {
    const result = calculateReadingJourneyStats(
      [
        book(1, '2026-06-01T00:00:00Z', '2026-06-01T18:00:00Z'),
        book(2, '2026-06-02T00:00:00Z', '2026-06-02T18:00:00Z'),
      ],
      new Date('2026-08-09T00:00:00Z'),
      'UTC',
    );

    expect(result.insights?.averageDaysToFinish).toBe(1);
  });

  it('treats a completion before acquisition as completed at acquisition', () => {
    const result = calculateReadingJourneyStats(
      [
        book(1, '2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        {
          id: 2,
          libraryId: 1,
          libraryName: 'Test',
          dateFinished: '2026-01-01T00:00:00Z',
          readStatus: ReadStatus.READ,
        },
      ],
      new Date('2026-08-09T00:00:00Z'),
      'UTC',
    );

    expect(result.months).toEqual([
      {
        month: '2026-01',
        cumulativeAdded: 0,
        cumulativeFinished: 2,
        backlog: 0,
      },
      {
        month: '2026-02',
        cumulativeAdded: 1,
        cumulativeFinished: 2,
        backlog: 0,
      },
    ]);
    expect(result.insights?.currentBacklog).toBe(0);
    expect(result.insights?.totalFinished).toBe(2);
    expect(result.insights?.averageFinishedPerMonth).toBe(1);
    expect(result.insights?.averageDaysToFinish).toBeNull();
    expect(result.insights?.bestReadingMonth).toEqual({ month: '2026-01', count: 2 });
  });
});

function book(id: number, addedOn: string, dateFinished: string): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Test',
    addedOn,
    dateFinished,
    readStatus: ReadStatus.READ,
  };
}
