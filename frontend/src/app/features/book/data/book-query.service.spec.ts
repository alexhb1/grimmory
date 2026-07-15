import {HttpErrorResponse} from '@angular/common/http';
import {HttpTestingController} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {
  injectInfiniteQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createAuthServiceStub,
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {AuthService} from '../../../shared/service/auth.service';
import {bookQueryKeys} from './book-query-keys';
import {BookPageParams} from './book-query-params';
import {BookPage} from './book-query.models';
import {BookDetail, BookRecommendation} from './book-response.models';
import {retryTransientBookQueryError} from './book-query-transport';
import {BookQueryService} from './book-query.service';

const PARAMS: BookPageParams = {
  query: 'dune',
  facets: {
    any: {genre: ['Science Fiction']},
    must: {},
    not: {},
  },
  sort: [{key: 'title', direction: 'asc'}],
  size: 20,
};

function page(
  ids: number[],
  links: BookPage['links'] = [],
): BookPage {
  return {
    content: ids.map(id => ({id, libraryId: 1, libraryName: 'Library'})),
    page: {
      number: 0,
      size: 20,
      totalElements: ids.length,
      totalPages: ids.length === 0 ? 0 : 1,
      cursor: 'opaque-current-cursor',
    },
    links,
  };
}

@Injectable()
class InfiniteQueryHost {
  private readonly books = inject(BookQueryService);
  readonly query = injectInfiniteQuery(() => this.books.infinitePage(PARAMS));
}

describe('BookQueryService', () => {
  let service: BookQueryService;
  let queryClient: QueryClient;
  let authService: ReturnType<typeof createAuthServiceStub>;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    authService = createAuthServiceStub();
    queryClient.setDefaultOptions({queries: {retry: false}});

    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        {provide: AuthService, useValue: authService},
        BookQueryService,
        InfiniteQueryHost,
      ],
    });

    service = TestBed.inject(BookQueryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('removes its cached book queries when the authenticated session ends', () => {
    const key = bookQueryKeys.detail(7, false);
    queryClient.setQueryData(key, {id: 7});

    authService.token.set(null);
    flushSignalAndQueryEffects();

    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it('fetches one bounded summary page with normalized parameters', async () => {
    const resultPromise = queryClient.fetchQuery(service.page(PARAMS));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?facet_logic=or&query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
    request.flush(page([1, 2]));

    await expect(resultPromise).resolves.toMatchObject({
      content: [{id: 1}, {id: 2}],
    });
  });

  it('sends all three facet selection buckets', async () => {
    const resultPromise = queryClient.fetchQuery(service.page({
      ...PARAMS,
      facets: {
        any: {genre: ['Science Fiction']},
        must: {language: ['English']},
        not: {tag: ['Abandoned']},
      },
    }));
    const request = http.expectOne(
      `${API_CONFIG.BASE_URL}/api/v1/books/page?facet_logic=or&query=dune&facet=genre:Science%20Fiction&facet_must=language:English&facet_not=tag:Abandoned&sort=title&size=20`,
    );
    request.flush(page([1]));

    await expect(resultPromise).resolves.toMatchObject({content: [{id: 1}]});
  });

  it('fetches facets without sort or size', async () => {
    const resultPromise = queryClient.fetchQuery(service.facets(PARAMS));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/facets?facet_logic=or&query=dune&facet=genre:Science%20Fiction`);
    request.flush({
      links: [{rel: 'self', href: '/api/v1/books/facets?query=dune', type: 'application/json'}],
      facets: [{
        metadata: {rel: 'facet', key: 'genre', title: 'Genre'},
        links: [{
          rel: ['self', 'facet'],
          href: '/api/v1/books/page?facet=genre%3AFantasy',
          type: 'application/json',
          title: 'Fantasy',
          value: 'Fantasy',
          properties: {numberOfItems: 4},
        }],
      }],
    });

    await expect(resultPromise).resolves.toEqual([{
      rel: 'facet',
      key: 'genre',
      title: 'Genre',
      values: [{value: 'Fantasy', title: 'Fantasy', count: 4, state: 'any'}],
    }]);
  });

  it('fetches matching IDs with sort but no size', async () => {
    const resultPromise = queryClient.fetchQuery(service.ids(PARAMS));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/ids?facet_logic=or&query=dune&facet=genre:Science%20Fiction&sort=title`);
    request.flush([3, 1, 2]);

    await expect(resultPromise).resolves.toEqual([3, 1, 2]);
  });

  it('binds pages, facets, and IDs to one normalized collection intent', () => {
    const collection = service.collection({
      ...PARAMS,
      query: '  dune  ',
      facets: {
        any: {genre: ['Science Fiction', 'Science Fiction']},
        must: {},
        not: {},
      },
    });
    const equivalent = service.collection(PARAMS);

    expect(collection.membershipIdentity).toBe(equivalent.membershipIdentity);
    expect(collection.orderingIdentity).toBe(equivalent.orderingIdentity);
    expect(collection.page(20).queryKey).toEqual(service.page(PARAMS).queryKey);
    expect(collection.infinitePage(20).queryKey).toEqual(service.infinitePage(PARAMS).queryKey);
    expect(collection.facets().queryKey).toEqual(service.facets(PARAMS).queryKey);
    expect(collection.ids().queryKey).toEqual(service.ids(PARAMS).queryKey);
    expect(collection.page(50).queryKey).not.toEqual(collection.page(20).queryKey);
  });

  it('distinguishes collection membership from ordering', () => {
    const collection = service.collection(PARAMS);
    const differentlySizedPage = {...PARAMS, size: 50};
    const differentlyOrdered = service.collection({
      ...PARAMS,
      sort: [{key: 'title', direction: 'desc'}],
    });
    const differentlyFiltered = service.collection({...PARAMS, query: 'foundation'});

    expect(service.collection(differentlySizedPage).membershipIdentity)
      .toBe(collection.membershipIdentity);
    expect(service.collection(differentlySizedPage).orderingIdentity)
      .toBe(collection.orderingIdentity);
    expect(differentlyOrdered.membershipIdentity).toBe(collection.membershipIdentity);
    expect(differentlyOrdered.orderingIdentity).not.toBe(collection.orderingIdentity);
    expect(differentlyFiltered.membershipIdentity).not.toBe(collection.membershipIdentity);
    expect(differentlyFiltered.orderingIdentity).not.toBe(collection.orderingIdentity);
  });

  it('follows the exact next href for an infinite query', async () => {
    const host = TestBed.inject(InfiniteQueryHost);
    TestBed.flushEffects();

    const firstRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?facet_logic=or&query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
    firstRequest.flush({
      ...page([1]),
      links: [
        {
          rel: 'self',
          href: '/api/v1/books/page?cursor=random-origin',
          type: 'application/json',
        },
        {
          rel: 'next',
          href: '/api/v1/books/page?facet=genre%3AScience%20Fiction&cursor=opaque',
          type: 'application/json',
        },
      ],
    });
    await vi.waitFor(() => expect(host.query.isSuccess()).toBe(true));

    const nextPromise = host.query.fetchNextPage();
    const nextRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?facet=genre%3AScience%20Fiction&cursor=opaque`);
    nextRequest.flush({
      ...page([2]),
      links: [{
        rel: 'self',
        href: '/api/v1/books/page?cursor=opaque',
        type: 'application/json',
      }],
    });
    const nextResult = await nextPromise;

    expect(nextResult.data?.pages.flatMap(current => current.content.map(book => book.id))).toEqual([1, 2]);
  });

  it('keys an infinite query by its normalized parameters alone so the cache is shared', () => {
    const first = service.infinitePage(PARAMS);
    const second = service.infinitePage(PARAMS);

    expect(first.queryKey).toEqual(second.queryKey);
  });

  it('stops paging when the backend emits no next link', async () => {
    const host = TestBed.inject(InfiniteQueryHost);
    TestBed.flushEffects();

    const firstRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?facet_logic=or&query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
    firstRequest.flush(page([1]));
    await vi.waitFor(() => expect(host.query.isSuccess()).toBe(true));

    expect(host.query.hasNextPage()).toBe(false);
  });

  it('fetches full book detail with the description flag', async () => {
    const resultPromise = queryClient.fetchQuery(service.detail(42, {withDescription: true}));
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<BookDetail>>();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/42?withDescription=true`);
    const response: BookDetail = {
      id: 42,
      libraryId: 1,
      libraryName: 'Library',
      metadata: {bookId: 42, title: 'Dune', description: 'Desert power.'},
    };
    request.flush(response);

    await expect(resultPromise).resolves.toMatchObject({
      id: 42,
      metadata: {description: 'Desert power.'},
    });
  });

  it('normalizes batch IDs while preserving the backend response order', async () => {
    const resultPromise = queryClient.fetchQuery(service.batch(
      [9, 3, 9],
      {withDescription: false},
    ));
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<BookDetail[]>>();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/batch?ids=3,9&withDescription=false`);
    const response: BookDetail[] = [
      {id: 9, libraryId: 1, libraryName: 'Library'},
      {id: 3, libraryId: 1, libraryName: 'Library'},
    ];
    request.flush(response);

    await expect(resultPromise).resolves.toMatchObject([{id: 9}, {id: 3}]);
  });

  it('fetches recommendations and preserves similarity order', async () => {
    const resultPromise = queryClient.fetchQuery(service.recommendations(42, 2));
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<BookRecommendation[]>>();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/42/recommendations?limit=2`);
    const response: BookRecommendation[] = [
      {book: {id: 8, libraryId: 1, libraryName: 'Library'}, similarityScore: 0.4},
      {book: {id: 5, libraryId: 1, libraryName: 'Library'}, similarityScore: 0.9},
    ];
    request.flush(response);

    await expect(resultPromise).resolves.toMatchObject([
      {book: {id: 8}, similarityScore: 0.4},
      {book: {id: 5}, similarityScore: 0.9},
    ]);
  });

  it('rejects malformed page structure and nested summary data', async () => {
    const malformedPagePromise = queryClient.fetchQuery(service.page(PARAMS));
    const malformedPageRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?facet_logic=or&query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
    malformedPageRequest.flush({
      ...page([1]),
      links: [{rel: ['next'], href: 42, type: 'application/json'}],
    });
    await expect(malformedPagePromise).rejects.toThrow(/page\.links\[0\]\.href/);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const malformedSummaryPromise = queryClient.fetchQuery(service.page(PARAMS));
    const malformedSummaryRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?facet_logic=or&query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
    malformedSummaryRequest.flush({
      ...page([1]),
      content: [{
        id: 1,
        libraryId: 1,
        libraryName: 'Library',
        metadata: {bookId: 1, allMetadataLocked: false},
        supplementaryFiles: [{
          id: 4,
          bookId: 2,
          book: false,
          folderBased: false,
        }],
      }],
    });
    await expect(malformedSummaryPromise).rejects.toThrow(/page\.content/);
    expect(warnSpy).toHaveBeenCalledWith(
      '[BookQuery] Dropped malformed book from page response',
      expect.objectContaining({message: expect.stringMatching(/page\.content\[0\]\.supplementaryFiles\[0\]\.bookId/)}),
    );
  });

  it('validates backend book records without rewriting their fields', async () => {
    const resultPromise = queryClient.fetchQuery(service.page(PARAMS));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?facet_logic=or&query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
    request.flush({
      ...page([1]),
      futurePageField: true,
      content: [{
        id: 1,
        libraryId: 1,
        libraryName: 'Library',
        legacyTopLevelTitle: 'Dune',
        metadata: {
          bookId: 1,
          title: 'Dune',
          allMetadataLocked: false,
          futureMetadataField: 'allowed on the wire',
        },
      }],
    });

    await expect(resultPromise).resolves.toEqual({
      content: [{
        id: 1,
        libraryId: 1,
        libraryName: 'Library',
        legacyTopLevelTitle: 'Dune',
        metadata: {
          bookId: 1,
          title: 'Dune',
          allMetadataLocked: false,
          futureMetadataField: 'allowed on the wire',
        },
      }],
      page: {
        number: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        cursor: 'opaque-current-cursor',
      },
      links: [],
    });
  });

  it('cancels an active HTTP request through the query signal', async () => {
    const options = service.detail(42, {withDescription: false});
    const resultPromise = queryClient.fetchQuery(options);
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/42?withDescription=false`);

    await queryClient.cancelQueries({queryKey: options.queryKey});

    expect(request.cancelled).toBe(true);
    await expect(resultPromise).rejects.toBeDefined();
  });

  it('rejects invalid detail, batch, and recommendation requests before HTTP', () => {
    expect(() => service.detail(0, {withDescription: false})).toThrow('Book ID must be a positive integer.');
    expect(() => service.batch([], {withDescription: false})).toThrow('At least one book ID is required.');
    expect(() => service.recommendations(1, 26)).toThrow('Book recommendation limit must be between 1 and 25.');
    http.expectNone(() => true);
  });

  it('retries only transient failures and only twice', () => {
    const networkError = new HttpErrorResponse({status: 0});
    const badRequest = new HttpErrorResponse({status: 400});
    const serverError = new HttpErrorResponse({status: 503});

    expect(retryTransientBookQueryError(0, networkError)).toBe(true);
    expect(retryTransientBookQueryError(0, badRequest)).toBe(false);
    expect(retryTransientBookQueryError(0, serverError)).toBe(true);
    expect(retryTransientBookQueryError(0, new Error('Unexpected failure'))).toBe(false);
    expect(retryTransientBookQueryError(2, serverError)).toBe(false);
  });
});
