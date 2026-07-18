import {HttpClient, HttpParams} from '@angular/common/http';
import {effect, inject, Injectable} from '@angular/core';
import {
  hashKey,
  infiniteQueryOptions,
  queryOptions,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {lastValueFrom, map, takeUntil} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {findBrowsePageLink} from '../../../core/data/browse.models';
import {bookQueryKeys} from './book-query-keys';
import {
  BookCollectionFilterParams,
  BookDescriptionOptions,
  BookPageParams,
  BookQueryParams,
  normalizeBookBatchParams,
  normalizeBookCollectionFilterParams,
  normalizeBookId,
  normalizeBookPageParams,
  normalizeBookQueryParams,
  normalizeRecommendationLimit,
  toCollectionHttpParams,
  toIdsHttpParams,
  toPageHttpParams,
} from './book-query-params';
import {
  decodeBookBatch,
  decodeBookDetail,
  decodeBookFacetGroups,
  decodeBookIds,
  decodeBookPage,
  decodeBookRecommendations,
} from './book-query-response-decoder';
import {BookFacetGroup, BookPage} from './book-query.models';
import {BookDetail, BookRecommendation} from './book-response.models';
import {abortSignal, BOOK_QUERY_DEFAULTS} from './book-query-transport';
import {AuthService} from '../../../shared/service/auth.service';

@Injectable({providedIn: 'root'})
export class BookQueryService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly queryClient = inject(QueryClient);
  private readonly baseUrl = `${API_CONFIG.BASE_URL}/api/v1/books`;

  constructor() {
    effect(() => {
      if (this.authService.token() === null) {
        this.queryClient.removeQueries({queryKey: bookQueryKeys.all()});
      }
    });
  }

  collection(params: BookQueryParams) {
    const ordering = normalizeBookQueryParams(params);
    const membership = normalizeBookCollectionFilterParams(params);

    return {
      membershipIdentity: hashKey(bookQueryKeys.facets(membership)),
      orderingIdentity: hashKey(bookQueryKeys.ids(ordering)),
      page: (size: number) => this.page({...ordering, size}),
      infinitePage: (size: number) => this.infinitePage({...ordering, size}),
      facets: () => this.facets(membership),
      ids: () => this.ids(ordering),
    };
  }

  page(params: BookPageParams) {
    const normalized = normalizeBookPageParams(params);

    return queryOptions({
      queryKey: bookQueryKeys.boundedPage(normalized),
      queryFn: ({signal}) => this.fetchPage(normalized, null, signal),
      ...BOOK_QUERY_DEFAULTS,
    });
  }

  infinitePage(params: BookPageParams) {
    const normalized = normalizeBookPageParams(params);

    return infiniteQueryOptions({
      queryKey: bookQueryKeys.infinitePage(normalized),
      queryFn: ({pageParam, signal}) => this.fetchPage(normalized, pageParam, signal),
      initialPageParam: null as string | null,
      getNextPageParam: page => findBrowsePageLink(page, 'next')?.href,
      ...BOOK_QUERY_DEFAULTS,
    });
  }

  facets(params: BookCollectionFilterParams) {
    const normalized = normalizeBookCollectionFilterParams(params);

    return queryOptions({
      queryKey: bookQueryKeys.facets(normalized),
      queryFn: ({signal}): Promise<BookFacetGroup[]> => this.getDecoded(
        `${this.baseUrl}/facets`,
        signal,
        decodeBookFacetGroups,
        toCollectionHttpParams(normalized),
      ),
      ...BOOK_QUERY_DEFAULTS,
    });
  }

  ids(params: BookQueryParams) {
    const normalized = normalizeBookQueryParams(params);

    return queryOptions({
      queryKey: bookQueryKeys.ids(normalized),
      queryFn: ({signal}) => this.getDecoded(
        `${this.baseUrl}/ids`,
        signal,
        decodeBookIds,
        toIdsHttpParams(normalized),
      ),
      ...BOOK_QUERY_DEFAULTS,
      staleTime: 0,
    });
  }

  detail(bookId: number, {withDescription}: BookDescriptionOptions) {
    const normalizedBookId = normalizeBookId(bookId);

    return queryOptions({
      queryKey: bookQueryKeys.detail(normalizedBookId, withDescription),
      queryFn: ({signal}): Promise<BookDetail> => this.getDecoded(
        `${this.baseUrl}/${normalizedBookId}`,
        signal,
        response => decodeBookDetail(response, normalizedBookId),
        new HttpParams().set('withDescription', withDescription.toString()),
      ),
      ...BOOK_QUERY_DEFAULTS,
    });
  }

  batch(bookIds: readonly number[], {withDescription}: BookDescriptionOptions) {
    const normalized = normalizeBookBatchParams(bookIds, withDescription);

    return queryOptions({
      queryKey: bookQueryKeys.batch(normalized),
      queryFn: ({signal}): Promise<BookDetail[]> => this.getDecoded(
        `${this.baseUrl}/batch`,
        signal,
        response => decodeBookBatch(response, normalized.bookIds),
        new HttpParams()
          .set('ids', normalized.bookIds.join(','))
          .set('withDescription', normalized.withDescription.toString()),
      ),
      ...BOOK_QUERY_DEFAULTS,
    });
  }

  recommendations(bookId: number, limit: number) {
    const normalizedBookId = normalizeBookId(bookId);
    const normalizedLimit = normalizeRecommendationLimit(limit);

    return queryOptions({
      queryKey: bookQueryKeys.recommendation(normalizedBookId, normalizedLimit),
      queryFn: ({signal}): Promise<BookRecommendation[]> => this.getDecoded(
        `${this.baseUrl}/${normalizedBookId}/recommendations`,
        signal,
        response => decodeBookRecommendations(response, normalizedBookId),
        new HttpParams().set('limit', normalizedLimit.toString()),
      ),
      ...BOOK_QUERY_DEFAULTS,
    });
  }

  private fetchPage(
    params: BookPageParams,
    nextHref: string | null,
    signal: AbortSignal,
  ): Promise<BookPage> {
    if (nextHref !== null) {
      return this.getDecoded(`${API_CONFIG.BASE_URL}${nextHref}`, signal, decodeBookPage);
    }

    return this.getDecoded(
      `${this.baseUrl}/page`,
      signal,
      decodeBookPage,
      toPageHttpParams(params),
    );
  }

  private getDecoded<T>(
    url: string,
    signal: AbortSignal,
    decoder: (value: unknown) => T,
    params?: HttpParams,
  ): Promise<T> {
    return lastValueFrom(
      this.http.get<unknown>(url, {params}).pipe(
        map(decoder),
        takeUntil(abortSignal(signal)),
      ),
    );
  }
}
