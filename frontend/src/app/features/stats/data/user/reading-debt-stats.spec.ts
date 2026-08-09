import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateReadingDebtStats } from './reading-debt-stats';

type ReadingDebtBook = Parameters<typeof calculateReadingDebtStats>[0][number];

describe('calculateReadingDebtStats', () => {
  it('seeds the chart with backlog that predates the twelve-month window', () => {
    const stats = calculateReadingDebtStats([
      book(1, '2020-01-01'),
      book(2, '2020-02-01', '2026-02-01'),
      book(3, '2026-03-01'),
    ], new Date('2026-06-15T12:00:00Z'));

    expect(stats.months[0].backlog).toBe(2);
    expect(stats.currentBacklog).toBe(2);
  });

  it('keeps a flat current backlog when no recent events exist', () => {
    const stats = calculateReadingDebtStats(
      [book(1, '2020-01-01')],
      new Date('2026-06-15T12:00:00Z'),
    );

    expect(stats.months).toHaveLength(12);
    expect(stats.currentBacklog).toBe(1);
    expect(stats.trend).toBe('steady');
  });

  it('returns no chart when old additions and completions leave no backlog', () => {
    const stats = calculateReadingDebtStats(
      [book(1, '2020-01-01', '2020-02-01')],
      new Date('2026-06-15T12:00:00Z'),
    );

    expect(stats.months).toEqual([]);
    expect(stats.currentBacklog).toBe(0);
  });

  it('ignores additions and completions after the calculation date', () => {
    const stats = calculateReadingDebtStats([
      book(1, '2026-06-20'),
      book(2, '2020-01-01', '2026-06-20'),
    ], new Date('2026-06-15T12:00:00Z'));

    expect(stats.currentBacklog).toBe(1);
    expect(stats.months.at(-1)).toMatchObject({ addedCount: 0, finishedCount: 0, backlog: 1 });
  });

  it('treats a completion before acquisition as completed at acquisition', () => {
    const stats = calculateReadingDebtStats(
      [book(1, '2026-05-01', '2026-04-01')],
      new Date('2026-06-15T12:00:00Z'),
    );

    expect(stats.months.every(({ backlog }) => backlog >= 0)).toBe(true);
    expect(stats.currentBacklog).toBe(0);
    expect(stats.months.at(-2)).toMatchObject({ addedCount: 1, finishedCount: 1, backlog: 0 });
  });

  it('includes movement in the first displayed month when classifying the trend', () => {
    const stats = calculateReadingDebtStats(
      [book(1, '2025-07-01')],
      new Date('2026-06-15T12:00:00Z'),
    );

    expect(stats.months[0]).toMatchObject({ addedCount: 1, backlog: 1 });
    expect(stats.trend).toBe('growing');
  });
});

function book(id: number, addedOn?: string, dateFinished?: string): ReadingDebtBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: dateFinished ? ReadStatus.READ : ReadStatus.UNREAD,
    addedOn,
    dateFinished,
  };
}
