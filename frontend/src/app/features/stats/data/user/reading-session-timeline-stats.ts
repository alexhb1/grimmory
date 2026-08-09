import { HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';
import {
  addWeeks,
  endOfISOWeek,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
} from 'date-fns';

import { QUERY_DEFAULTS } from '../../../../core/data/query-transport';
import { type BookFileType } from '../../../book/data/book-response.models';
import { fetchUserStats, USER_STATS_QUERY_ROOT } from './user-stats-transport';

interface ReadingSessionTimelineResponse {
  bookId: number;
  bookTitle: string;
  startDate: string;
  bookType: BookFileType | null;
  totalDurationSeconds: number;
}

interface TimelineSession {
  readonly key: string;
  readonly bookId: number;
  readonly bookTitle: string;
  readonly bookType: BookFileType | null;
  readonly start: Date;
  readonly end: Date;
}

export interface TimelineSessionSegment {
  readonly key: string;
  readonly bookId: number;
  readonly bookTitle: string;
  readonly bookType: BookFileType | null;
  readonly dayIndex: number;
  readonly lane: number;
  readonly laneCount: number;
  readonly startHour: number;
  readonly endHour: number;
  readonly durationMinutes: number;
}

interface ReadingWeekRange {
  readonly start: Date;
  readonly end: Date;
}

export interface SessionTimelineStats {
  readonly segments: readonly TimelineSessionSegment[];
  readonly sessionCount: number;
}

const MILLISECONDS_PER_MINUTE = 60_000;
const DAY_COUNT = 7;

export const EMPTY_SESSION_TIMELINE_STATS: SessionTimelineStats = {
  segments: [],
  sessionCount: 0,
};

export function mapSessionTimeline(
  response: readonly ReadingSessionTimelineResponse[],
  year: number,
  week: number,
): SessionTimelineStats {
  const sessions = response.flatMap<TimelineSession>((item, index) => {
    const start = new Date(item.startDate);
    if (
      Number.isNaN(start.getTime())
      || item.totalDurationSeconds <= 0
    ) return [];

    const end = new Date(start.getTime() + item.totalDurationSeconds * 1000);

    return [{
      key: `${item.bookId}:${start.getTime()}:${index}`,
      bookId: item.bookId,
      bookTitle: item.bookTitle,
      bookType: item.bookType ?? null,
      start,
      end,
    }];
  });

  return {
    segments: splitSessionsAcrossWeek(sessions, readingWeekRange(year, week)),
    sessionCount: sessions.length,
  };
}

export function sessionTimelineQuery(http: HttpClient, year: number, week: number) {
  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'session-timeline', year, week],
    queryFn: ({ signal }) =>
      fetchUserStats<ReadingSessionTimelineResponse[]>(http, 'reading/timeline', signal, {
        year,
        week,
      }).then((response) => mapSessionTimeline(response, year, week)),
    ...QUERY_DEFAULTS,
  });
}

export function readingWeekRange(year: number, week: number): ReadingWeekRange {
  const date = setISOWeek(setISOWeekYear(new Date(), year), week);
  return { start: startOfISOWeek(date), end: endOfISOWeek(date) };
}

function splitSessionsAcrossWeek(
  sessions: readonly TimelineSession[],
  range: ReadingWeekRange,
): readonly TimelineSessionSegment[] {
  const weekEnd = addWeeks(range.start, 1);
  const segments = sessions.flatMap<TimelineSessionSegment>((session) => {
    let cursor = session.start < range.start ? range.start : session.start;
    const boundedEnd = session.end > weekEnd ? weekEnd : session.end;
    const sessionSegments: TimelineSessionSegment[] = [];

    while (cursor < boundedEnd) {
      const nextMidnight = startOfNextDay(cursor);
      const end = boundedEnd < nextMidnight ? boundedEnd : nextMidnight;

      sessionSegments.push({
        key: `${session.key}:${cursor.getTime()}`,
        bookId: session.bookId,
        bookTitle: session.bookTitle,
        bookType: session.bookType,
        dayIndex: toIsoDayIndex(cursor),
        lane: 0,
        laneCount: 1,
        startHour: toHour(cursor),
        endHour: end.getTime() === nextMidnight.getTime() ? 24 : toHour(end),
        durationMinutes: (end.getTime() - cursor.getTime()) / MILLISECONDS_PER_MINUTE,
      });

      cursor = end;
    }

    return sessionSegments;
  });

  return assignTimelineLanes(segments);
}

function assignTimelineLanes(
  sessions: readonly TimelineSessionSegment[],
): readonly TimelineSessionSegment[] {
  const positions = new Map<string, { lane: number; laneCount: number }>();

  for (let dayIndex = 0; dayIndex < DAY_COUNT; dayIndex++) {
    const daySessions = sessions
      .filter((session) => session.dayIndex === dayIndex)
      .sort(
        (left, right) =>
          left.startHour - right.startHour || right.endHour - left.endHour,
      );
    let laneEnds: number[] = [];
    let clusterEnd = Number.NEGATIVE_INFINITY;
    let clusterKeys: string[] = [];

    const finishCluster = (): void => {
      const laneCount = laneEnds.length;
      for (const key of clusterKeys) {
        const position = positions.get(key);
        if (position) positions.set(key, { ...position, laneCount });
      }
    };

    for (const session of daySessions) {
      if (session.startHour >= clusterEnd) {
        finishCluster();
        laneEnds = [];
        clusterKeys = [];
        clusterEnd = session.endHour;
      } else {
        clusterEnd = Math.max(clusterEnd, session.endHour);
      }

      const availableLane = laneEnds.findIndex((laneEnd) => session.startHour >= laneEnd);
      const lane = availableLane === -1 ? laneEnds.length : availableLane;
      laneEnds[lane] = session.endHour;
      clusterKeys.push(session.key);
      positions.set(session.key, { lane, laneCount: 1 });
    }

    finishCluster();
  }

  return sessions.map((session) => ({
    ...session,
    ...(positions.get(session.key) ?? { lane: 0, laneCount: 1 }),
  }));
}

function toIsoDayIndex(date: Date): number {
  return (date.getDay() + 6) % DAY_COUNT;
}

function toHour(date: Date): number {
  return (
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600 +
    date.getMilliseconds() / 3_600_000
  );
}

function startOfNextDay(date: Date): Date {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);
  return nextDay;
}
