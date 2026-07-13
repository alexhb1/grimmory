import {HttpErrorResponse} from '@angular/common/http';
import {HttpTestingController} from '@angular/common/http/testing';
import {ApplicationRef, inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {
  injectInfiniteQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, expectTypeOf, it} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {createQueryClientHarness} from '../../../core/testing/query-testing';
import {BookPageParams} from './book-query-params';
import {BookPage} from './book-query.models';
import {BookDetail, BookRecommendation} from './book-response.models';
import {BookQueryService, retryTransientBookQueryError} from './book-query.service';

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
      totalPages: 1,
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
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    queryClient.setDefaultOptions({queries: {retry: false}});

    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        BookQueryService,
        InfiniteQueryHost,
      ],
    });

    service = TestBed.inject(BookQueryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('does not issue HTTP when the service or its options are created', () => {
    service.page(PARAMS);
    service.pageAt({...PARAMS, page: 7});
    service.infinitePage(PARAMS);
    service.facets(PARAMS);
    service.ids(PARAMS);
    service.detail(7, true);
    service.batch([7, 8], false);
    service.recommendations(7, 20);

    http.expectNone(() => true);
  });

  it('fetches one bounded summary page with normalized parameters', async () => {
    const resultPromise = queryClient.fetchQuery(service.page(PARAMS));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
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
      `${API_CONFIG.BASE_URL}/api/v1/books/page?query=dune&facet=genre:Science%20Fiction&facet_must=language:English&facet_not=tag:Abandoned&sort=title&size=20`,
    );
    request.flush(page([1]));

    await expect(resultPromise).resolves.toMatchObject({content: [{id: 1}]});
  });

  it('fetches one direct-offset summary page with a windowed query key', async () => {
    const options = service.pageAt({...PARAMS, page: 7});
    const resultPromise = queryClient.fetchQuery(options);
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?query=dune&facet=genre:Science%20Fiction&sort=title&size=20&page=7`);
    request.flush(page([141, 142]));

    expect(options.queryKey).toEqual([
      'books', 'query', 'collection', 'page', 'windowed',
      {
        query: 'dune',
        facets: {
          any: {genre: ['Science Fiction']},
          must: {},
          not: {},
        },
        sort: [{key: 'title', direction: 'asc'}],
        size: 20,
        page: 7,
      },
    ]);
    await expect(resultPromise).resolves.toMatchObject({content: [{id: 141}, {id: 142}]});
  });

  it('fetches facets without sort or size', async () => {
    const resultPromise = queryClient.fetchQuery(service.facets(PARAMS));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/facets?query=dune&facet=genre:Science%20Fiction`);
    request.flush({facets: [{
      metadata: {rel: 'facet', key: 'genre', title: 'Genre'},
      links: [{
        rel: 'facet',
        href: '/api/v1/books/page?facet=genre%3AFantasy',
        type: 'application/json',
        title: 'Fantasy',
        value: 'Fantasy',
        properties: {numberOfItems: 4},
      }],
    }]});

    await expect(resultPromise).resolves.toEqual([{
      rel: 'facet',
      key: 'genre',
      title: 'Genre',
      values: [{value: 'Fantasy', title: 'Fantasy', count: 4}],
    }]);
  });

  it('fetches matching IDs with sort but no size', async () => {
    const resultPromise = queryClient.fetchQuery(service.ids(PARAMS));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/ids?query=dune&facet=genre:Science%20Fiction&sort=title`);
    request.flush([3, 1, 2]);

    await expect(resultPromise).resolves.toEqual([3, 1, 2]);
  });

  it('follows the exact next href for an infinite query', async () => {
    const host = TestBed.inject(InfiniteQueryHost);
    TestBed.flushEffects();

    const firstRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
    firstRequest.flush(page([1], [{
      rel: ['next'],
      href: '/api/v1/books/page?facet=genre%3AScience%20Fiction&cursor=opaque',
      type: 'application/json',
    }]));
    await TestBed.inject(ApplicationRef).whenStable();

    const nextPromise = host.query.fetchNextPage();
    const nextRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?facet=genre%3AScience%20Fiction&cursor=opaque`);
    nextRequest.flush(page([2]));
    const nextResult = await nextPromise;

    expect(nextResult.data?.pages.flatMap(current => current.content.map(book => book.id))).toEqual([1, 2]);
  });

  it('fetches full book detail with the description flag', async () => {
    const resultPromise = queryClient.fetchQuery(service.detail(42, true));
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
    const resultPromise = queryClient.fetchQuery(service.batch([9, 3, 9], false));
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
    const malformedPageRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
    malformedPageRequest.flush({
      ...page([1]),
      links: [{rel: ['next'], href: 42, type: 'application/json'}],
    });
    await expect(malformedPagePromise).rejects.toThrow(
      'Invalid book query response at page.links[0].href: expected a string.',
    );

    const malformedSummaryPromise = queryClient.fetchQuery(service.page(PARAMS));
    const malformedSummaryRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
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
    await expect(malformedSummaryPromise).rejects.toThrow(
      'Invalid book query response at page.content[0].supplementaryFiles[0].bookId: expected book ID 1.',
    );
  });

  it('caches only decoded clean-model fields while tolerating wire extensions', async () => {
    const resultPromise = queryClient.fetchQuery(service.page(PARAMS));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
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
        metadata: {bookId: 1, title: 'Dune', allMetadataLocked: false},
      }],
      page: {number: 0, size: 20, totalElements: 1, totalPages: 1},
      links: [],
    });
  });

  it('requires summary-only metadata contract fields', async () => {
    const resultPromise = queryClient.fetchQuery(service.page(PARAMS));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/page?query=dune&facet=genre:Science%20Fiction&sort=title&size=20`);
    request.flush({
      ...page([1]),
      content: [{
        id: 1,
        libraryId: 1,
        libraryName: 'Library',
        metadata: {bookId: 1},
      }],
    });

    await expect(resultPromise).rejects.toThrow(
      'Invalid book query response at page.content[0].metadata.allMetadataLocked: expected the field to be present.',
    );
  });

  it('rejects malformed facet groups and ID lists', async () => {
    const facetPromise = queryClient.fetchQuery(service.facets(PARAMS));
    const facetRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/facets?query=dune&facet=genre:Science%20Fiction`);
    facetRequest.flush({facets: [{
      metadata: {rel: 'facet', key: 'genre', title: 'Genre'},
      links: [{
        rel: 'facet',
        href: '/api/v1/books/page',
        type: 'application/json',
        title: 'Fantasy',
        value: 'Fantasy',
        properties: {numberOfItems: 'four'},
      }],
    }]});
    await expect(facetPromise).rejects.toThrow(
      'Invalid book query response at facets.facets[0].links[0].properties.numberOfItems: expected a finite number.',
    );

    const idsPromise = queryClient.fetchQuery(service.ids(PARAMS));
    const idsRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/ids?query=dune&facet=genre:Science%20Fiction&sort=title`);
    idsRequest.flush([3, 3]);
    await expect(idsPromise).rejects.toThrow(
      'Invalid book query response at ids[1]: duplicate book ID 3.',
    );
  });

  it('rejects detail data that does not belong to the requested book', async () => {
    const resultPromise = queryClient.fetchQuery(service.detail(42, true));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/42?withDescription=true`);
    request.flush({
      id: 42,
      libraryId: 1,
      libraryName: 'Library',
      metadata: {bookId: 41},
    });

    await expect(resultPromise).rejects.toThrow(
      'Invalid book query response at detail.metadata.bookId: expected book ID 42.',
    );
  });

  it('rejects malformed nested detail state', async () => {
    const resultPromise = queryClient.fetchQuery(service.detail(42, false));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/42?withDescription=false`);
    request.flush({
      id: 42,
      libraryId: 1,
      libraryName: 'Library',
      shelves: [{name: 'Reading', publicShelf: false, bookCount: 1, sort: {
        field: null,
        direction: 'SIDEWAYS',
      }}],
      epubProgress: {
        cfi: null,
        href: null,
        contentSourceProgressPercent: null,
        percentage: null,
        ttsPositionCfi: null,
      },
    });

    await expect(resultPromise).rejects.toThrow(
      'Invalid book query response at detail.shelves[0].sort.direction: expected ASCENDING, DESCENDING, or null.',
    );
  });

  it('requires batch responses to correlate exactly with requested IDs', async () => {
    const resultPromise = queryClient.fetchQuery(service.batch([3, 9], false));
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/batch?ids=3,9&withDescription=false`);
    request.flush([
      {id: 3, libraryId: 1, libraryName: 'Library'},
      {id: 7, libraryId: 1, libraryName: 'Library'},
    ]);

    await expect(resultPromise).rejects.toThrow(
      'Invalid book query response at batch[1].id: unexpected book ID 7.',
    );
  });

  it('rejects invalid recommendation identities and similarity scores', async () => {
    const identityPromise = queryClient.fetchQuery(service.recommendations(42, 2));
    const identityRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/42/recommendations?limit=2`);
    identityRequest.flush([{book: {
      id: 42,
      libraryId: 1,
      libraryName: 'Library',
    }, similarityScore: 0.5}]);
    await expect(identityPromise).rejects.toThrow(
      'Invalid book query response at recommendations[0].book.id: recommendation cannot be the source book 42.',
    );

    const scorePromise = queryClient.fetchQuery(service.recommendations(42, 2));
    const scoreRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/42/recommendations?limit=2`);
    scoreRequest.flush([{book: {
      id: 7,
      libraryId: 1,
      libraryName: 'Library',
    }, similarityScore: 'close'}]);
    await expect(scorePromise).rejects.toThrow(
      'Invalid book query response at recommendations[0].similarityScore: expected a finite number.',
    );
  });

  it('cancels an active HTTP request through the query signal', async () => {
    const options = service.detail(42, false);
    const resultPromise = queryClient.fetchQuery(options);
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/42?withDescription=false`);

    await queryClient.cancelQueries({queryKey: options.queryKey});

    expect(request.cancelled).toBe(true);
    await expect(resultPromise).rejects.toBeDefined();
  });

  it('rejects invalid detail, batch, and recommendation requests before HTTP', () => {
    expect(() => service.detail(0, false)).toThrow('Book ID must be a positive integer.');
    expect(() => service.batch([], false)).toThrow('At least one book ID is required.');
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
