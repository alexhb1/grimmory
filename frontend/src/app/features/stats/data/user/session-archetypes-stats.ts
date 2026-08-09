import { type HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';

import { QUERY_DEFAULTS } from '../../../../core/data/query-transport';
import { fetchUserStats, USER_STATS_QUERY_ROOT } from './user-stats-transport';

interface SessionScatterResponse {
  hourOfDay: number;
  durationMinutes: number;
  dayOfWeek: number;
}

type SessionArchetype = 'morning' | 'afternoon' | 'evening' | 'night';

const ARCHETYPES: readonly SessionArchetype[] = ['morning', 'afternoon', 'evening', 'night'];

export function mapSessionArchetypeStats(
  response: readonly SessionScatterResponse[],
) {
  const sessions = response.filter(isValidSession);
  if (sessions.length === 0) {
    return { days: [], sessionCount: 0, dominantArchetype: null } as const;
  }

  const pointsByDay = new Map<number, { hourOfDay: number; durationMinutes: number }[]>();
  const archetypeCounts = new Map<SessionArchetype, number>(
    ARCHETYPES.map((archetype) => [archetype, 0]),
  );

  for (const session of sessions) {
    const points = pointsByDay.get(session.dayOfWeek) ?? [];
    points.push({ hourOfDay: session.hourOfDay, durationMinutes: session.durationMinutes });
    pointsByDay.set(session.dayOfWeek, points);

    const archetype = toArchetype(session.hourOfDay);
    archetypeCounts.set(archetype, (archetypeCounts.get(archetype) ?? 0) + 1);
  }

  const days = Array.from({ length: 7 }, (_, index) => index + 1)
    .map((dayOfWeek) => ({
      dayOfWeek,
      points: pointsByDay.get(dayOfWeek) ?? [],
    }))
    .filter((day) => day.points.length > 0);

  return {
    days,
    sessionCount: sessions.length,
    dominantArchetype: dominantArchetype(archetypeCounts),
  };
}

function isValidSession(session: SessionScatterResponse): boolean {
  return session.hourOfDay >= 0
    && session.hourOfDay < 24
    && Number.isInteger(session.dayOfWeek)
    && session.dayOfWeek >= 1
    && session.dayOfWeek <= 7
    && session.durationMinutes >= 0;
}

export type SessionArchetypeStats = ReturnType<typeof mapSessionArchetypeStats>;

export const EMPTY_SESSION_ARCHETYPE_STATS: SessionArchetypeStats = mapSessionArchetypeStats([]);

export function sessionArchetypesQuery(http: HttpClient, year: number) {
  return queryOptions({
    queryKey: [...USER_STATS_QUERY_ROOT, 'session-archetypes', year],
    queryFn: ({ signal }) =>
      fetchUserStats<SessionScatterResponse[]>(http, 'reading/session-scatter', signal, {
        year,
      }).then(mapSessionArchetypeStats),
    ...QUERY_DEFAULTS,
  });
}

function toArchetype(hourOfDay: number): SessionArchetype {
  if (hourOfDay >= 5 && hourOfDay < 12) return 'morning';
  if (hourOfDay >= 12 && hourOfDay < 17) return 'afternoon';
  if (hourOfDay >= 17 && hourOfDay < 22) return 'evening';
  return 'night';
}

function dominantArchetype(
  counts: ReadonlyMap<SessionArchetype, number>,
): SessionArchetype | null {
  let dominant: SessionArchetype | null = null;
  let highest = 0;
  let tied = false;

  for (const archetype of ARCHETYPES) {
    const value = counts.get(archetype) ?? 0;
    if (value > highest) {
      highest = value;
      dominant = archetype;
      tied = false;
    } else if (value === highest && value > 0) {
      tied = true;
    }
  }

  return tied ? null : dominant;
}
