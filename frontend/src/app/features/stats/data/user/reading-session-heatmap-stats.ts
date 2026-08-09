import { HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';

import { QUERY_DEFAULTS } from '../../../../core/data/query-transport';
import { fetchUserStats, USER_STATS_QUERY_ROOT } from './user-stats-transport';

interface ReadingSessionHeatmapResponse {
  date: string;
  count: number;
}

interface SessionHeatmapCell {
  readonly week: number;
  readonly weekday: number;
  readonly date: string;
  readonly count: number;
}

export type ReadingMilestoneId =
  | '7-day-streak'
  | '30-day-streak'
  | '100-reading-days'
  | '365-reading-days'
  | 'year-long-streak';

interface ReadingMilestone {
  readonly id: ReadingMilestoneId;
  readonly unlocked: boolean;
}

const DAY_MS = 86_400_000;

export function mapSessionHeatmapCalendar(
  year: number,
  response: readonly ReadingSessionHeatmapResponse[],
) {
  const counts = new Map(
    response
      .filter((entry) => entry.count > 0)
      .map((entry) => [entry.date, entry.count] as const),
  );
  const firstDay = new Date(year, 0, 1);
  const lastDay = new Date(year, 11, 31);
  const cursor = new Date(firstDay);
  cursor.setDate(cursor.getDate() - mondayOffset(firstDay));

  const cells: SessionHeatmapCell[] = [];
  let week = 0;
  let maxCount = 0;
  let totalSessions = 0;

  while (cursor <= lastDay) {
    for (let weekday = 0; weekday < 7; weekday++) {
      if (cursor >= firstDay && cursor <= lastDay) {
        const date = toDateKey(cursor);
        const count = counts.get(date) ?? 0;
        cells.push({ week, weekday, date, count });
        maxCount = Math.max(maxCount, count);
        totalSessions += count;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    week++;
  }

  return { cells, maxCount, totalSessions };
}

export type SessionHeatmapCalendar = ReturnType<typeof mapSessionHeatmapCalendar>;

export const EMPTY_SESSION_HEATMAP_CALENDAR: SessionHeatmapCalendar = {
  cells: [],
  maxCount: 0,
  totalSessions: 0,
};

export const EMPTY_READING_STREAKS = {
  hasData: false,
  currentStreak: 0,
  longestStreak: 0,
  totalReadingDays: 0,
  consistencyPercent: 0,
  milestones: [] as readonly ReadingMilestone[],
} as const;

export function mapReadingStreaks(
  response: readonly ReadingSessionHeatmapResponse[],
  currentDate = new Date(),
) {
  const today = toDateKey(currentDate);
  const dates = Array.from(new Set(
    response
      .filter((entry) => entry.count > 0)
      .map((entry) => entry.date)
      .filter((date) => isDateKey(date) && date <= today),
  )).sort();
  if (dates.length === 0) return EMPTY_READING_STREAKS;

  const streaks: number[] = [];
  let streakStart = dates[0];
  for (let index = 1; index <= dates.length; index++) {
    const previous = dates[index - 1];
    if (index === dates.length || daysBetween(previous, dates[index]) !== 1) {
      streaks.push(daysBetween(streakStart, previous) + 1);
      if (index < dates.length) streakStart = dates[index];
    }
  }

  const longestStreak = Math.max(...streaks);
  const lastStreak = streaks[streaks.length - 1];
  const lastDate = dates[dates.length - 1];
  const yesterday = previousDateKey(today);
  const currentStreak = lastDate === today || lastDate === yesterday ? lastStreak : 0;

  const totalReadingDays = dates.length;
  const totalPossibleDays = daysBetween(dates[0], today) + 1;
  const consistencyPercent = totalPossibleDays > 0
    ? Math.round((totalReadingDays / totalPossibleDays) * 100)
    : 0;

  return {
    hasData: true,
    currentStreak,
    longestStreak,
    totalReadingDays,
    consistencyPercent,
    milestones: [
      { id: '7-day-streak', unlocked: longestStreak >= 7 },
      { id: '30-day-streak', unlocked: longestStreak >= 30 },
      { id: '100-reading-days', unlocked: totalReadingDays >= 100 },
      { id: '365-reading-days', unlocked: totalReadingDays >= 365 },
      { id: 'year-long-streak', unlocked: longestStreak >= 365 },
    ] as readonly ReadingMilestone[],
  };
}

export type ReadingStreaks = ReturnType<typeof mapReadingStreaks>;

export function sessionHeatmapQuery(http: HttpClient, year: number) {
  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'session-heatmap', year],
    queryFn: ({ signal }) =>
      fetchUserStats<ReadingSessionHeatmapResponse[]>(http, 'reading/heatmap', signal, {
        year,
      }).then((response) => mapSessionHeatmapCalendar(year, response)),
    ...QUERY_DEFAULTS,
  });
}

export function readingDatesQuery(http: HttpClient) {
  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'reading-dates'],
    queryFn: ({ signal }) =>
      fetchUserStats<ReadingSessionHeatmapResponse[]>(http, 'reading/dates', signal)
        .then(mapReadingStreaks),
    ...QUERY_DEFAULTS,
  });
}

function mondayOffset(date: Date): number {
  const weekday = date.getDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function previousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
