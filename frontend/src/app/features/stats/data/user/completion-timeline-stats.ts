import { type HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';

import { QUERY_DEFAULTS } from '../../../../core/data/query-transport';
import { type KnownBookReadStatus } from '../../../book/data/book-response.models';
import { fetchUserStats, USER_STATS_QUERY_ROOT } from './user-stats-transport';

interface CompletionTimelineResponse {
  month: number;
  statusBreakdown: Partial<Record<KnownBookReadStatus, number>>;
  finishedBooks: number;
}

interface CompletionTimelineMonth {
  readonly month: number;
  readonly finished: number;
  readonly partiallyRead: number;
  readonly activeReading: number;
  readonly paused: number;
  readonly discontinued: number;
}

export const EMPTY_COMPLETION_TIMELINE_STATS = mapCompletionTimelineStats([]);

export function mapCompletionTimelineStats(
  response: readonly CompletionTimelineResponse[],
) {
  const byMonth = new Map<number, CompletionTimelineResponse>();
  for (const entry of response) {
    byMonth.set(entry.month, entry);
  }

  const months = buildMonths(byMonth);

  return {
    months,
    totalBooks: months.reduce(
      (sum, month) =>
        sum
        + month.finished
        + month.partiallyRead
        + month.activeReading
        + month.paused
        + month.discontinued,
      0,
    ),
  };
}

export type CompletionTimelineStats = ReturnType<typeof mapCompletionTimelineStats>;

export function completionTimelineQuery(http: HttpClient, year: number) {
  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'completion-timeline', year],
    queryFn: ({ signal }) =>
      fetchUserStats<CompletionTimelineResponse[]>(http, 'reading/completion-timeline', signal, {
        year,
      }).then(mapCompletionTimelineStats),
    ...QUERY_DEFAULTS,
  });
}

function buildMonths(
  byMonth: ReadonlyMap<number, CompletionTimelineResponse>,
): readonly CompletionTimelineMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const entry = byMonth.get(month);
    const breakdown = entry?.statusBreakdown ?? {};

    return {
      month,
      finished: entry?.finishedBooks ?? count(breakdown, 'READ'),
      partiallyRead: count(breakdown, 'PARTIALLY_READ'),
      activeReading: count(breakdown, 'READING') + count(breakdown, 'RE_READING'),
      paused: count(breakdown, 'PAUSED'),
      discontinued: count(breakdown, 'ABANDONED') + count(breakdown, 'WONT_READ'),
    };
  });
}

function count(
  breakdown: Partial<Record<KnownBookReadStatus, number>>,
  status: KnownBookReadStatus,
): number {
  return breakdown[status] ?? 0;
}
