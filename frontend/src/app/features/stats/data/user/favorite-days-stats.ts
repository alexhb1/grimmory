import { HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';

import { QUERY_DEFAULTS } from '../../../../core/data/query-transport';
import {
  fetchUserStats,
  type UserStatsMonthFilter,
  USER_STATS_QUERY_ROOT,
  userStatsMonthRequest,
} from './user-stats-transport';

interface FavoriteDaysResponse {
  dayOfWeek: number;
  sessionCount: number;
  totalDurationSeconds: number;
}

const WEEKDAY_COUNT = 7;

export const EMPTY_FAVORITE_DAYS_STATS = mapFavoriteDays([]);

export function mapFavoriteDays(response: readonly FavoriteDaysResponse[]) {
  const rows = new Map(response.map((entry) => [entry.dayOfWeek - 1, entry]));

  const days = Array.from({ length: WEEKDAY_COUNT }, (_, dayIndex) => {
    const row = rows.get(dayIndex);
    return {
      dayIndex,
      sessionCount: row?.sessionCount ?? 0,
      durationHours: (row?.totalDurationSeconds ?? 0) / 3600,
    };
  });

  return {
    days,
    totalSessions: days.reduce((total, day) => total + day.sessionCount, 0),
  };
}

export type FavoriteDaysStats = ReturnType<typeof mapFavoriteDays>;

export function favoriteDaysQuery(http: HttpClient, params: UserStatsMonthFilter) {
  const request = userStatsMonthRequest(params);

  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'favorite-days', request],
    queryFn: ({ signal }) =>
      fetchUserStats<FavoriteDaysResponse[]>(http, 'reading/favorite-days', signal, request).then(
        mapFavoriteDays,
      ),
    ...QUERY_DEFAULTS,
  });
}
