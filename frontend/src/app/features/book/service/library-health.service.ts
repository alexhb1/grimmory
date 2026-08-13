import {computed, inject, Injectable, DestroyRef} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {HttpClient} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';
import {RxStompService} from '../../../shared/websocket/rx-stomp.service';
import {API_CONFIG} from '../../../core/config/api-config';
import {injectQuery, queryOptions, QueryClient} from '@tanstack/angular-query-experimental';

const LIBRARY_HEALTH_QUERY_KEY = ['libraryHealth'] as const;

function isLibraryHealth(value: unknown): value is Record<number, boolean> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(status => typeof status === 'boolean');
}

@Injectable({providedIn: 'root'})
export class LibraryHealthService {
  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/libraries/health`;
  private http = inject(HttpClient);
  private rxStompService = inject(RxStompService);
  private queryClient = inject(QueryClient);
  private destroyRef = inject(DestroyRef);

  private socketInitialized = false;

  private healthQuery = injectQuery(() => ({
    ...this.getHealthQueryOptions(),
    enabled: false, // manually triggered via initialize()
  }));

  health = computed(() => this.healthQuery.data() ?? {});

  private getHealthQueryOptions() {
    return queryOptions({
      queryKey: LIBRARY_HEALTH_QUERY_KEY,
      queryFn: () => lastValueFrom(this.http.get<Record<number, boolean>>(this.url))
    });
  }

  fetchHealth(): void {
    void this.queryClient.prefetchQuery(this.getHealthQueryOptions());
  }

  initWebsocket(): void {
    if (this.socketInitialized) return;

    this.rxStompService.watch('/topic/library-health')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(msg => {
        const payload: unknown = JSON.parse(msg.body);
        if (typeof payload === 'object' && payload !== null && 'libraryHealth' in payload
          && isLibraryHealth(payload.libraryHealth)) {
          this.queryClient.setQueryData(LIBRARY_HEALTH_QUERY_KEY, payload.libraryHealth);
        }
      });
    this.socketInitialized = true;
  }

  isUnhealthy(libraryId: number): boolean {
    return this.health()[libraryId] === false;
  }
}
