import { HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';

import { QUERY_DEFAULTS } from '../../../../core/data/query-transport';
import {
  fetchUserStats,
  type UserStatsMonthFilter,
  USER_STATS_QUERY_ROOT,
  userStatsMonthRequest,
} from './user-stats-transport';

export interface PeakHoursResponse {
  hourOfDay: number;
  sessionCount: number;
  totalDurationSeconds: number;
}

const HOURS_PER_DAY = 24;

export const EMPTY_PEAK_HOURS_STATS = mapPeakHours([]);

export function mapPeakHours(response: readonly PeakHoursResponse[]) {
  const rows = new Map(response.map((entry) => [entry.hourOfDay, entry]));

  const hours = Array.from({ length: HOURS_PER_DAY }, (_, hour) => {
    const row = rows.get(hour);
    const sessionCount = row?.sessionCount ?? 0;

    return {
      hour,
      sessionCount,
      averageDurationMinutes:
        row && sessionCount > 0 ? Math.round(row.totalDurationSeconds / 60 / sessionCount) : 0,
    };
  });

  return {
    hours,
    totalSessions: hours.reduce((total, entry) => total + entry.sessionCount, 0),
  };
}

export type PeakHoursStats = ReturnType<typeof mapPeakHours>;

export function peakHoursQuery(http: HttpClient, params: UserStatsMonthFilter) {
  return queryOptions({
    ...peakHoursResponseQuery(http, params),
    select: mapPeakHours,
  });
}

export function peakHoursResponseQuery(http: HttpClient, params: UserStatsMonthFilter) {
  const request = userStatsMonthRequest(params);

  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'peak-hours', request],
    queryFn: ({ signal }) =>
      fetchUserStats<PeakHoursResponse[]>(http, 'reading/peak-hours', signal, request),
    ...QUERY_DEFAULTS,
  });
}
