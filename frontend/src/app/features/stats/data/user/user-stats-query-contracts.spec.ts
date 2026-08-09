import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { API_CONFIG } from '../../../../core/config/api-config';
import {
  completionRaceQuery,
  EMPTY_COMPLETION_RACE_STATS,
} from './completion-race-stats';
import {
  completionTimelineQuery,
  EMPTY_COMPLETION_TIMELINE_STATS,
} from './completion-timeline-stats';
import { EMPTY_FAVORITE_DAYS_STATS, favoriteDaysQuery } from './favorite-days-stats';
import { EMPTY_GENRE_STATS, genreStatsQuery } from './genre-stats';
import { EMPTY_PAGE_TURNER_STATS, pageTurnerStatsQuery } from './page-turner-stats';
import { peakHoursResponseQuery } from './peak-hours-stats';
import {
  EMPTY_READING_STREAKS,
  mapSessionHeatmapCalendar,
  readingDatesQuery,
  sessionHeatmapQuery,
} from './reading-session-heatmap-stats';
import {
  EMPTY_SESSION_TIMELINE_STATS,
  sessionTimelineQuery,
} from './reading-session-timeline-stats';
import {
  EMPTY_SESSION_ARCHETYPE_STATS,
  sessionArchetypesQuery,
} from './session-archetypes-stats';

describe('user stats query contracts', () => {
  let http: Parameters<typeof completionRaceQuery>[0];
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    TestBed.resetTestingModule();
  });

  it.each([
    ['completion race', () => completionRaceQuery(http, 2026),
      'reading/completion-race', { year: '2026' },
      ['user-stats', 'completion-race', 2026], EMPTY_COMPLETION_RACE_STATS],
    ['completion timeline', () => completionTimelineQuery(http, 2026),
      'reading/completion-timeline', { year: '2026' },
      ['user-stats', 'completion-timeline', 2026], EMPTY_COMPLETION_TIMELINE_STATS],
    ['favorite days', () => favoriteDaysQuery(http, { year: 2026, month: 4 }),
      'reading/favorite-days', { year: '2026', month: '4' },
      ['user-stats', 'favorite-days', { year: 2026, month: 4 }], EMPTY_FAVORITE_DAYS_STATS],
    ['genres', () => genreStatsQuery(http), 'reading/genres', {},
      ['user-stats', 'genre-stats'], EMPTY_GENRE_STATS],
    ['page turner', () => pageTurnerStatsQuery(http), 'reading/page-turner-scores', {},
      ['user-stats', 'page-turner'], EMPTY_PAGE_TURNER_STATS],
    ['peak hours', () => peakHoursResponseQuery(http, { year: 2026, month: null }),
      'reading/peak-hours', { year: '2026' }, ['user-stats', 'peak-hours', { year: 2026 }], []],
    ['session heatmap', () => sessionHeatmapQuery(http, 2026),
      'reading/heatmap', { year: '2026' },
      ['user-stats', 'session-heatmap', 2026], mapSessionHeatmapCalendar(2026, [])],
    ['reading dates', () => readingDatesQuery(http), 'reading/dates', {},
      ['user-stats', 'reading-dates'], EMPTY_READING_STREAKS],
    ['session timeline', () => sessionTimelineQuery(http, 2026, 32),
      'reading/timeline', { year: '2026', week: '32' },
      ['user-stats', 'session-timeline', 2026, 32], EMPTY_SESSION_TIMELINE_STATS],
    ['session archetypes', () => sessionArchetypesQuery(http, 2026),
      'reading/session-scatter', { year: '2026' },
      ['user-stats', 'session-archetypes', 2026], EMPTY_SESSION_ARCHETYPE_STATS],
  ] as const)(
    'calls the %s endpoint with its complete cache and result contract',
    async (_name, create, path, params, queryKey, expected) => {
      const query = create();
      const queryFn = query.queryFn as (context: { signal: AbortSignal }) => Promise<unknown>;
      const result = queryFn({ signal: new AbortController().signal });
      const request = httpTesting.expectOne((candidate) =>
        candidate.url === `${API_CONFIG.BASE_URL}/api/v1/user-stats/${path}`);

      expect(query.queryKey).toEqual(queryKey);
      expect(Object.fromEntries(request.request.params.keys().map((key) => [
        key,
        request.request.params.get(key),
      ]))).toEqual(params);

      request.flush([]);
      await expect(result).resolves.toEqual(expected);
    },
  );
});
