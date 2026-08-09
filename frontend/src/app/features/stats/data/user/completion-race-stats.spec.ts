import { describe, expect, it } from 'vitest';

import { mapCompletionRaceStats } from './completion-race-stats';

type CompletionRaceResponse = Parameters<typeof mapCompletionRaceStats>[0][number];

describe('mapCompletionRaceStats', () => {
  it('groups ordered progress by book and derives race summaries', () => {
    const stats = mapCompletionRaceStats([
      session(1, '2026-01-03', 100),
      session(1, '2026-01-01', 20),
      session(2, '2026-01-01', 10),
      session(2, '2026-01-05', 120),
    ]);

    expect(stats.books[0].points).toEqual([
      { dayNumber: 0, progress: 20 },
      { dayNumber: 2, progress: 100 },
    ]);
    expect(stats.books.map(({ bookId }) => bookId)).toEqual([1, 2]);
    expect(stats.totalSessions).toBe(4);
    expect(stats.averageDays).toBe(3);
    expect(stats.medianDays).toBe(3);
    expect(stats.fastest?.bookTitle).toBe('Book 1');
    expect(stats.slowest?.bookTitle).toBe('Book 2');
  });

  it('clamps progress and ignores malformed session values', () => {
    const stats = mapCompletionRaceStats([
      session(1, '2026-01-01', -10),
      session(1, '2026-01-02', 150),
      session(2, 'not-a-date', 50),
    ]);

    expect(stats.books).toHaveLength(1);
    expect(stats.books[0].points).toEqual([
      { dayNumber: 0, progress: 0 },
      { dayNumber: 1, progress: 100 },
    ]);
    expect(stats.totalSessions).toBe(2);
  });

  it('resolves elapsed-day ties by book ID independently of response order', () => {
    const entries = [
      session(2, '2026-01-01', 10),
      session(2, '2026-01-03', 100),
      session(1, '2026-01-01', 10),
      session(1, '2026-01-03', 100),
    ];

    const forwards = mapCompletionRaceStats(entries);
    const backwards = mapCompletionRaceStats([...entries].reverse());

    expect(backwards).toEqual(forwards);
    expect(forwards.books.map(({ bookId }) => bookId)).toEqual([1, 2]);
    expect(forwards.fastest?.bookId).toBe(1);
    expect(forwards.slowest?.bookId).toBe(1);
  });
});

function session(bookId: number, sessionDate: string, endProgress: number): CompletionRaceResponse {
  return { bookId, bookTitle: `Book ${bookId}`, sessionDate, endProgress };
}
