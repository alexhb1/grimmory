import {HttpClient, HttpErrorResponse, HttpParams} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {
  infiniteQueryOptions,
  queryOptions,
} from '@tanstack/angular-query-experimental';
import {lastValueFrom, Observable} from 'rxjs';
import {map, takeUntil} from 'rxjs/operators';

import {API_CONFIG} from '../../../core/config/api-config';
import {bookQueryKeys} from './book-query-keys';
import {
  BookPageParams,
  BookPageAtParams,
  BookQueryParams,
  normalizeBookBatchParams,
  normalizeBookFacetParams,
  normalizeBookId,
  normalizeBookIdsParams,
  normalizeBookPageParams,
  normalizeBookPageAtParams,
  normalizeRecommendationLimit,
  toFacetHttpParams,
  toIdsHttpParams,
  toPageHttpParams,
  toPageAtHttpParams,
} from './book-query-params';
import {
  decodeBookBatch,
  decodeBookDetail,
  decodeBookFacetGroups,
  decodeBookIds,
  decodeBookPage,
  decodeBookRecommendations,
} from './book-query-response-decoder';
import {BookFacetGroup, BookPage, findPageLink} from './book-query.models';
import {BookDetail, BookRecommendation} from './book-response.models';

@Injectable({providedIn: 'root'})
export class BookQueryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_CONFIG.BASE_URL}/api/v1/books`;

  page(params: BookPageParams) {
    const normalized = normalizeBookPageParams(params);

    return queryOptions({
      queryKey: bookQueryKeys.boundedPage(normalized),
      queryFn: ({signal}) => this.fetchPage(normalized, null, signal),
      staleTime: 30_000,
      retry: retryTransientBookQueryError,
    });
  }

  pageAt(params: BookPageAtParams) {
    const normalized = normalizeBookPageAtParams(params);

    return queryOptions({
      queryKey: bookQueryKeys.windowedPage(normalized),
      queryFn: ({signal}): Promise<BookPage> => this.getDecoded(
        `${this.baseUrl}/page`,
        signal,
        decodeBookPage,
        toPageAtHttpParams(normalized),
      ),
      staleTime: 30_000,
      retry: retryTransientBookQueryError,
    });
  }

  infinitePage(params: BookPageParams) {
    const normalized = normalizeBookPageParams(params);

    return infiniteQueryOptions({
      queryKey: bookQueryKeys.infinitePage(normalized),
      queryFn: ({pageParam, signal}) => this.fetchPage(normalized, pageParam, signal),
      initialPageParam: null as string | null,
      getNextPageParam: page => findPageLink(page, 'next')?.href,
      staleTime: 30_000,
      retry: retryTransientBookQueryError,
    });
  }

  facets(params: BookQueryParams) {
    const normalized = normalizeBookFacetParams(params);

    return queryOptions({
      queryKey: bookQueryKeys.facets(normalized),
      queryFn: ({signal}): Promise<BookFacetGroup[]> => this.getDecoded(
        `${this.baseUrl}/facets`,
        signal,
        decodeBookFacetGroups,
        toFacetHttpParams(normalized),
      ),
      staleTime: 30_000,
      retry: retryTransientBookQueryError,
    });
  }

  ids(params: BookQueryParams) {
    const normalized = normalizeBookIdsParams(params);

    return queryOptions({
      queryKey: bookQueryKeys.ids(normalized),
      queryFn: ({signal}) => this.getDecoded(
        `${this.baseUrl}/ids`,
        signal,
        decodeBookIds,
        toIdsHttpParams(normalized),
      ),
      staleTime: 0,
      retry: retryTransientBookQueryError,
    });
  }

  detail(bookId: number, withDescription: boolean) {
    const normalizedBookId = normalizeBookId(bookId);

    return queryOptions({
      queryKey: bookQueryKeys.detail(normalizedBookId, withDescription),
      queryFn: ({signal}): Promise<BookDetail> => this.getDecoded(
        `${this.baseUrl}/${normalizedBookId}`,
        signal,
        response => decodeBookDetail(response, normalizedBookId),
        new HttpParams().set('withDescription', withDescription.toString()),
      ),
      staleTime: 30_000,
      retry: retryTransientBookQueryError,
    });
  }

  batch(bookIds: readonly number[], withDescription: boolean) {
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
      staleTime: 30_000,
      retry: retryTransientBookQueryError,
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
      staleTime: 30_000,
      retry: retryTransientBookQueryError,
    });
  }

  private fetchPage(
    params: ReturnType<typeof normalizeBookPageParams>,
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

export function retryTransientBookQueryError(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) {
    return false;
  }

  return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
}

function abortSignal(signal: AbortSignal): Observable<void> {
  return new Observable(subscriber => {
    if (signal.aborted) {
      subscriber.next();
      subscriber.complete();
      return;
    }

    const onAbort = () => {
      subscriber.next();
      subscriber.complete();
    };
    signal.addEventListener('abort', onAbort, {once: true});
    return () => signal.removeEventListener('abort', onAbort);
  });
}
