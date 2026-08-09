import { type HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';

import { QUERY_DEFAULTS } from '../../../../core/data/query-transport';
import { fetchUserStats, USER_STATS_QUERY_ROOT } from './user-stats-transport';

interface GenreStatsResponse {
  genre: string;
  totalDurationSeconds: number;
}

const GENRE_STATS_LIMIT = 35;

export const EMPTY_GENRE_STATS = { rows: [] };

export function mapGenreStats(response: readonly GenreStatsResponse[]) {
  const rows = [...response]
    .sort((left, right) =>
      right.totalDurationSeconds - left.totalDurationSeconds
      || left.genre.localeCompare(right.genre))
    .slice(0, GENRE_STATS_LIMIT)
    .map((entry) => ({
      genre: entry.genre,
      totalDurationSeconds: entry.totalDurationSeconds,
    }));

  return { rows };
}

export type GenreStats = ReturnType<typeof mapGenreStats>;

export function genreStatsQuery(http: HttpClient) {
  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'genre-stats'],
    queryFn: ({ signal }) =>
      fetchUserStats<GenreStatsResponse[]>(http, 'reading/genres', signal).then(mapGenreStats),
    ...QUERY_DEFAULTS,
  });
}
