import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_CONFIG } from '../../../core/config/api-config';
import {
  createAuthServiceStub,
  createQueryClientHarness,
  flushQueryAsync,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import { AuthService } from '../../../shared/service/auth.service';
import { BookQueryService } from '../../book/data/book-query.service';
import { type BookPage } from '../../book/data/book-query.models';
import { type BookPageParams } from '../../book/data/book-query-params';
import { type BookSummary } from '../../book/data/book-response.models';
import { AllBooksStatsSourceService } from './all-books-stats-source.service';

const FIRST_PAGE_URL = `${API_CONFIG.BASE_URL}/api/v1/books/page?facet_logic=and&sort=title&size=100`;
const SECOND_PAGE_URL = `${API_CONFIG.BASE_URL}/api/v1/books/page?cursor=second-page`;
const THIRD_PAGE_URL = `${API_CONFIG.BASE_URL}/api/v1/books/page?cursor=third-page`;

function book(id: number, readStatus?: string): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus,
  };
}

function page(content: BookSummary[], nextHref?: string): BookPage {
  return {
    content,
    page: {
      number: 0,
      size: 100,
      totalElements: content.length,
      totalPages: nextHref ? 2 : 1,
      cursor: 'cursor',
    },
    links: nextHref
      ? [{ rel: ['next'], href: nextHref, type: 'application/json' }]
      : [],
  };
}

describe('AllBooksStatsSourceService', () => {
  let http: HttpTestingController;
  let queryClient: QueryClient;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    queryClient.setDefaultOptions({ queries: { retry: false } });

    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        { provide: AuthService, useValue: createAuthServiceStub() },
        BookQueryService,
        AllBooksStatsSourceService,
      ],
    });

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('walks every page and withholds books until the result is complete', async () => {
    const source = TestBed.inject(AllBooksStatsSourceService);
    flushSignalAndQueryEffects();

    http.expectOne(FIRST_PAGE_URL).flush(page([book(1, 'READ')], '/api/v1/books/page?cursor=second-page'));
    const secondRequest = await waitForRequest(SECOND_PAGE_URL);

    expect(source.isLoading()).toBe(true);
    expect(source.books()).toEqual([]);

    secondRequest.flush(page([book(2)], '/api/v1/books/page?cursor=third-page'));
    const thirdRequest = await waitForRequest(THIRD_PAGE_URL);

    expect(source.isLoading()).toBe(true);
    expect(source.books()).toEqual([]);

    thirdRequest.flush(page([book(3, 'unexpected-status')]));
    await flushQueryAsync();
    await vi.waitFor(() => expect(source.isLoading()).toBe(false));

    expect(source.isError()).toBe(false);
    expect(source.books().map(({ id, readStatus }) => ({ id, readStatus }))).toEqual([
      { id: 1, readStatus: 'READ' },
      { id: 2, readStatus: undefined },
      { id: 3, readStatus: 'unexpected-status' },
    ]);
  });

  it('fails closed when a later page cannot be loaded', async () => {
    const source = TestBed.inject(AllBooksStatsSourceService);
    flushSignalAndQueryEffects();

    http.expectOne(FIRST_PAGE_URL).flush(page([book(1)], '/api/v1/books/page?cursor=second-page'));
    const nextRequest = await waitForRequest(SECOND_PAGE_URL);
    nextRequest.flush('failed', { status: 400, statusText: 'Bad Request' });

    await flushQueryAsync();
    await vi.waitFor(() => expect(source.isError()).toBe(true));

    expect(source.isLoading()).toBe(false);
    expect(source.books()).toEqual([]);
  });

  it('resumes paging after a failed next page is refetched', async () => {
    const source = TestBed.inject(AllBooksStatsSourceService);
    flushSignalAndQueryEffects();

    http.expectOne(FIRST_PAGE_URL).flush(page([book(1)], '/api/v1/books/page?cursor=second-page'));
    const failedRequest = await waitForRequest(SECOND_PAGE_URL);
    failedRequest.flush('failed', { status: 400, statusText: 'Bad Request' });
    await flushQueryAsync();
    await vi.waitFor(() => expect(source.isError()).toBe(true));

    const refetch = queryClient.refetchQueries();
    const firstPageRefetch = await waitForRequest(FIRST_PAGE_URL);
    firstPageRefetch.flush(page([book(1)], '/api/v1/books/page?cursor=second-page'));
    await refetch;

    const recoveredRequest = await waitForRequest(SECOND_PAGE_URL);
    recoveredRequest.flush(page([book(2)]));
    await vi.waitFor(() => expect(source.isLoading()).toBe(false));

    expect(source.books().map(({ id }) => id)).toEqual([1, 2]);
  });

  it('finishes refreshing a stale partial walk before requesting its next page', async () => {
    const bookQuery = TestBed.inject(BookQueryService);
    const params = {
      facets: {},
      facetLogic: 'and',
      sort: [{ key: 'title', direction: 'asc' }],
      size: 100,
    } as const satisfies BookPageParams;
    const options = bookQuery.infinitePage(params);
    queryClient.setQueryData(options.queryKey, {
      pages: [page([book(1)], '/api/v1/books/page?cursor=second-page')],
      pageParams: [null],
    }, { updatedAt: 1 });

    TestBed.inject(AllBooksStatsSourceService);
    flushSignalAndQueryEffects();
    const refresh = http.expectOne(FIRST_PAGE_URL);

    expect(http.match(SECOND_PAGE_URL)).toEqual([]);

    refresh.flush(page([book(10)], '/api/v1/books/page?cursor=second-page'));
    const nextRequest = await waitForRequest(SECOND_PAGE_URL);
    nextRequest.flush(page([book(20)]));
    await flushQueryAsync();
  });

  async function waitForRequest(url: string): Promise<TestRequest> {
    let request: TestRequest | undefined;
    await vi.waitFor(async () => {
      await flushQueryAsync(1);
      [request] = http.match(url);
      expect(request).toBeDefined();
    });
    return request!;
  }
});
