import { type HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';

import { QUERY_DEFAULTS } from '../../../../core/data/query-transport';
import { fetchUserStats, USER_STATS_QUERY_ROOT } from './user-stats-transport';

interface PageTurnerScoreResponse {
  bookId: number;
  bookTitle: string;
  personalRating: number | null;
  gripScore: number;
  totalSessions: number;
  avgSessionDurationSeconds: number;
  sessionAcceleration: number;
  gapReduction: number;
  finishBurst: boolean;
}

export function mapPageTurnerStats(
  response: readonly PageTurnerScoreResponse[],
) {
  if (response.length === 0) {
    return { ranking: [], guiltyPleasure: null, averageGripScore: 0 };
  }

  const books = response.map(toPageTurnerBook);

  return {
    ranking: books,
    guiltyPleasure: books.find(
      (book) => book.gripScore >= 60
        && book.personalRating !== null
        && book.personalRating <= 3,
    ) ?? null,
    averageGripScore: Math.round(
      books.reduce((sum, book) => sum + book.gripScore, 0) / books.length,
    ),
  };
}

export type PageTurnerStats = ReturnType<typeof mapPageTurnerStats>;
export const EMPTY_PAGE_TURNER_STATS: PageTurnerStats = mapPageTurnerStats([]);

export function pageTurnerStatsQuery(http: HttpClient) {
  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'page-turner'],
    queryFn: ({ signal }) =>
      fetchUserStats<PageTurnerScoreResponse[]>(
        http,
        'reading/page-turner-scores',
        signal,
      ).then(mapPageTurnerStats),
    ...QUERY_DEFAULTS,
  });
}

function toPageTurnerBook(entry: PageTurnerScoreResponse) {
  return {
    bookId: entry.bookId,
    bookTitle: entry.bookTitle,
    gripScore: entry.gripScore,
    totalSessions: entry.totalSessions,
    avgSessionDurationSeconds: entry.avgSessionDurationSeconds,
    personalRating: entry.personalRating ?? null,
    sessionTrend: toSessionTrend(entry.sessionAcceleration),
    gapTrend: toGapTrend(entry.gapReduction),
    finishBurst: entry.finishBurst,
  };
}

function toSessionTrend(acceleration: number) {
  if (acceleration > 5) return 'increasing';
  if (acceleration < -5) return 'decreasing';
  return 'steady';
}

function toGapTrend(gapReduction: number) {
  if (gapReduction < -2) return 'shrinking';
  if (gapReduction > 2) return 'growing';
  return 'steady';
}
