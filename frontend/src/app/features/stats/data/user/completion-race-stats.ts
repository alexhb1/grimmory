import { type HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';

import { QUERY_DEFAULTS } from '../../../../core/data/query-transport';
import { fetchUserStats, USER_STATS_QUERY_ROOT } from './user-stats-transport';

interface CompletionRaceResponse {
  bookId: number;
  bookTitle: string;
  sessionDate: string;
  endProgress: number;
}

interface CompletionRaceBook {
  readonly bookId: number;
  readonly bookTitle: string;
  readonly points: readonly { dayNumber: number; progress: number }[];
  readonly totalDays: number;
}

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

export function mapCompletionRaceStats(
  response: readonly CompletionRaceResponse[],
) {
  const books = groupByBook(response);
  if (books.length === 0) return emptyCompletionRaceStats();

  const sortedDays = books.map((book) => book.totalDays).sort((left, right) => left - right);

  return {
    books,
    totalBooks: books.length,
    totalSessions: books.reduce((sum, book) => sum + book.points.length, 0),
    averageDays: Math.round(sortedDays.reduce((sum, days) => sum + days, 0) / sortedDays.length),
    medianDays: median(sortedDays),
    fastest: books.reduce((left, right) =>
      right.totalDays < left.totalDays
      || (right.totalDays === left.totalDays && right.bookId < left.bookId)
        ? right
        : left,
    ),
    slowest: books.reduce((left, right) =>
      right.totalDays > left.totalDays
      || (right.totalDays === left.totalDays && right.bookId < left.bookId)
        ? right
        : left,
    ),
  };
}

export type CompletionRaceStats = ReturnType<typeof mapCompletionRaceStats>;

export const EMPTY_COMPLETION_RACE_STATS: CompletionRaceStats = emptyCompletionRaceStats();

export function completionRaceQuery(http: HttpClient, year: number) {
  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'completion-race', year],
    queryFn: ({ signal }) =>
      fetchUserStats<CompletionRaceResponse[]>(http, 'reading/completion-race', signal, {
        year,
      }).then(mapCompletionRaceStats),
    ...QUERY_DEFAULTS,
  });
}

function groupByBook(response: readonly CompletionRaceResponse[]): readonly CompletionRaceBook[] {
  const sessionsByBook = new Map<number, { title: string; sessions: { time: number; progress: number }[] }>();

  for (const entry of response) {
    const time = new Date(entry.sessionDate).getTime();
    if (!Number.isFinite(time)) continue;

    const book = sessionsByBook.get(entry.bookId) ?? { title: entry.bookTitle, sessions: [] };
    book.sessions.push({ time, progress: Math.min(Math.max(entry.endProgress, 0), 100) });
    sessionsByBook.set(entry.bookId, book);
  }

  const books: CompletionRaceBook[] = [];
  for (const [bookId, { title, sessions }] of sessionsByBook) {
    if (sessions.length === 0) continue;

    const ordered = [...sessions].sort((left, right) => left.time - right.time);
    const startTime = ordered[0].time;
    const points = ordered.map((session) => ({
      dayNumber: Math.floor((session.time - startTime) / MILLISECONDS_PER_DAY),
      progress: session.progress,
    }));

    books.push({
      bookId,
      bookTitle: title,
      points,
      totalDays: points[points.length - 1].dayNumber,
    });
  }

  return books.sort((left, right) => left.bookId - right.bookId);
}

function median(sortedDays: readonly number[]): number {
  const middle = sortedDays.length / 2;
  return sortedDays.length % 2 === 0
    ? Math.round((sortedDays[middle - 1] + sortedDays[middle]) / 2)
    : sortedDays[Math.floor(middle)];
}

function emptyCompletionRaceStats() {
  return {
    books: [],
    totalBooks: 0,
    totalSessions: 0,
    averageDays: 0,
    medianDays: 0,
    fastest: null,
    slowest: null,
  } as const;
}
