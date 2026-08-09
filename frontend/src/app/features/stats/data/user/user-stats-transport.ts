import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { lastValueFrom, takeUntil } from 'rxjs';

import { API_CONFIG } from '../../../../core/config/api-config';
import { abortSignal } from '../../../../core/data/query-transport';
import { AuthService } from '../../../../shared/service/auth.service';

export const USER_STATS_QUERY_ROOT = ['user-stats'] as const;

export type UserStatsMonthFilter =
  | { readonly year: null; readonly month: null }
  | { readonly year: number; readonly month: number | null };

export function userStatsMonthRequest(
  { year, month }: UserStatsMonthFilter,
): Record<string, number> {
  return {
    ...(year === null ? {} : { year }),
    ...(year === null || month === null ? {} : { month }),
  };
}

@Injectable({ providedIn: 'root' })
export class UserStatsQueryCache {
  private readonly auth = inject(AuthService);
  private readonly queryClient = inject(QueryClient);

  constructor() {
    effect(() => {
      if (this.auth.token() === null) {
        this.queryClient.removeQueries({ queryKey: USER_STATS_QUERY_ROOT });
      }
    });
  }
}

export function fetchUserStats<T>(
  http: HttpClient,
  path: string,
  signal: AbortSignal,
  params?: Record<string, string | number>,
): Promise<T> {
  return lastValueFrom(
    http
      .get<T>(`${API_CONFIG.BASE_URL}/api/v1/user-stats/${path}`, { params })
      .pipe(takeUntil(abortSignal(signal))),
  );
}
