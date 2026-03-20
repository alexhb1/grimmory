import {computed, effect, inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';
import {injectQuery, queryOptions, QueryClient} from '@tanstack/angular-query-experimental';
import {API_CONFIG} from '../../../core/config/api-config';
import {AuthService} from '../../../shared/service/auth.service';
import {BOOK_SIDEBAR_COUNTS_QUERY_KEY} from './book-query-keys';

interface BookSidebarCounts {
  totalCount: number;
  unshelvedCount: number;
  libraryCounts: Record<string, number>;
  shelfCounts: Record<string, number>;
}

const EMPTY_SIDEBAR_COUNTS: BookSidebarCounts = {
  totalCount: 0,
  unshelvedCount: 0,
  libraryCounts: {},
  shelfCounts: {},
};

@Injectable({
  providedIn: 'root',
})
export class BookSidebarCountsService {
  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/books/sidebar-counts`;

  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private queryClient = inject(QueryClient);
  private readonly token = this.authService.token;

  private sidebarCountsQuery = injectQuery(() => ({
    ...this.getSidebarCountsQueryOptions(),
    enabled: !!this.token(),
  }));

  readonly counts = computed(() => this.sidebarCountsQuery.data() ?? EMPTY_SIDEBAR_COUNTS);
  readonly totalCount = computed(() => this.counts().totalCount);
  readonly unshelvedCount = computed(() => this.counts().unshelvedCount);

  constructor() {
    effect(() => {
      const token = this.token();
      if (token === null) {
        this.queryClient.removeQueries({queryKey: BOOK_SIDEBAR_COUNTS_QUERY_KEY});
      }
    });
  }

  getLibraryCountValue(libraryId: number): number {
    return this.counts().libraryCounts[libraryId] ?? 0;
  }

  getShelfCountValue(shelfId: number): number {
    return this.counts().shelfCounts[shelfId] ?? 0;
  }

  invalidate(): void {
    void this.queryClient.invalidateQueries({queryKey: BOOK_SIDEBAR_COUNTS_QUERY_KEY, exact: true});
  }

  private getSidebarCountsQueryOptions() {
    return queryOptions({
      queryKey: BOOK_SIDEBAR_COUNTS_QUERY_KEY,
      queryFn: () => lastValueFrom(this.http.get<BookSidebarCounts>(this.url)),
    });
  }
}
