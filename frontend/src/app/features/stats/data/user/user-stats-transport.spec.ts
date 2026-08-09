import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import {
  createAuthServiceStub,
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../../core/testing/query-testing';
import { API_CONFIG } from '../../../../core/config/api-config';
import { AuthService } from '../../../../shared/service/auth.service';
import {
  fetchUserStats,
  USER_STATS_QUERY_ROOT,
  UserStatsQueryCache,
  userStatsMonthRequest,
} from './user-stats-transport';

describe('user stats transport', () => {
  it('passes the existing endpoint parameters unchanged', async () => {
    let requestUrl: string | undefined;
    let requestParams: Record<string, string | number> | undefined;
    const http = {
      get: (url: string, options: { params: Record<string, string | number> }) => {
        requestUrl = url;
        requestParams = options.params;
        return of([]);
      },
    } as unknown as HttpClient;

    await fetchUserStats(http, 'reading/peak-hours', new AbortController().signal, {
      year: 2026,
    });

    expect(requestUrl).toBe(`${API_CONFIG.BASE_URL}/api/v1/user-stats/reading/peak-hours`);
    expect(requestParams).toEqual({ year: 2026 });
    expect(USER_STATS_QUERY_ROOT).toEqual(['user-stats']);
  });

  it('represents all-time and year-scoped periods without a month-only state', () => {
    expect(userStatsMonthRequest({ year: null, month: null })).toEqual({});
    expect(userStatsMonthRequest({ year: 2026, month: null })).toEqual({ year: 2026 });
    expect(userStatsMonthRequest({ year: 2026, month: 4 })).toEqual({ year: 2026, month: 4 });
  });

  it('cancels the HTTP subscription when the query is aborted', async () => {
    let unsubscribed = false;
    const http = {
      get: () => new Observable(() => () => {
        unsubscribed = true;
      }),
    } as unknown as HttpClient;
    const controller = new AbortController();
    const request = fetchUserStats(http, 'reading/peak-hours', controller.signal);

    controller.abort();

    await expect(request).rejects.toThrow();
    expect(unsubscribed).toBe(true);
  });

  it('removes endpoint stats when an in-app session is cleared', () => {
    const harness = createQueryClientHarness();
    const auth = createAuthServiceStub('first-account');
    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        { provide: AuthService, useValue: auth },
        UserStatsQueryCache,
      ],
    });
    TestBed.inject(UserStatsQueryCache);
    flushSignalAndQueryEffects();
    harness.queryClient.setQueryData([...USER_STATS_QUERY_ROOT, 'genres'], { genres: ['Private'] });

    auth.token.set(null);
    flushSignalAndQueryEffects();

    expect(harness.queryClient.getQueryData([...USER_STATS_QUERY_ROOT, 'genres'])).toBeUndefined();
    TestBed.resetTestingModule();
  });
});
