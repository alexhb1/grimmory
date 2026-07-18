import {TestBed} from '@angular/core/testing';
import {QueryClient, QueryObserver} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Book} from '../model/book.model';
import {bookQueryKeys} from '../data/book-query-keys';
import {BookDetail} from '../data/book-response.models';
import {normalizeBookPageParams} from '../data/book-query-params';
import {BOOKS_QUERY_KEY, bookDetailQueryKey, bookRecommendationsQueryKey} from './book-query-keys';
import {BookSocketService} from './book-socket.service';

function makeBook(id: number, overrides: Partial<Book> = {}): Book {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {
      bookId: id,
      title: `Book ${id}`,
      coverUpdatedOn: '2026-03-01T00:00:00Z',
    },
    ...overrides,
  };
}

function observeActiveQuery(queryClient: QueryClient, queryKey: readonly unknown[], data: unknown) {
  let fetchCount = 0;
  let abortCount = 0;
  const pendingResolutions: (() => void)[] = [];

  queryClient.setQueryData(queryKey, data);
  const observer = new QueryObserver(queryClient, {
    queryKey,
    staleTime: Infinity,
    queryFn: ({signal}) => new Promise(resolve => {
      fetchCount += 1;
      signal.addEventListener('abort', () => {
        abortCount += 1;
      });
      pendingResolutions.push(() => resolve(data));
    }),
  });
  const unsubscribe = observer.subscribe(() => undefined);

  return {
    fetchCount: () => fetchCount,
    abortCount: () => abortCount,
    finish: () => {
      pendingResolutions.splice(0).forEach(resolve => resolve());
      unsubscribe();
    },
  };
}

describe('BookSocketService', () => {
  let service: BookSocketService;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient();

    TestBed.configureTestingModule({
      providers: [
        BookSocketService,
        {provide: QueryClient, useValue: queryClient},
      ],
    });

    service = TestBed.inject(BookSocketService);
  });

  afterEach(() => {
    queryClient.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function flushSocketChanges(): void {
    vi.advanceTimersToNextTimer();
  }

  it('upserts a newly created book without refetching the legacy list', () => {
    const existing = makeBook(1);
    const created = makeBook(2);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [existing]);

    service.handleNewlyCreatedBook(created);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([existing, created]);
    expect(invalidateSpy).not.toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(2)});
  });

  it('invalidates the books query and removes detail queries for removed ids', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const kept = makeBook(2);
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [makeBook(1), kept]);
    queryClient.setQueryData(bookDetailQueryKey(1, false), makeBook(1));
    queryClient.setQueryData(bookRecommendationsQueryKey(1, 20), [kept]);
    queryClient.setQueryData(bookQueryKeys.detail(1, false), {
      id: 1,
      libraryId: 1,
      libraryName: 'Clean',
    });
    queryClient.setQueryData(bookQueryKeys.recommendation(1, 20), []);

    service.handleRemovedBookIds([1]);
    flushSocketChanges();

    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(queryClient.getQueryData(bookDetailQueryKey(1, false))).toBeUndefined();
    expect(queryClient.getQueryData(bookRecommendationsQueryKey(1, 20))).toBeUndefined();
    expect(queryClient.getQueryData(bookQueryKeys.detail(1, false))).toBeUndefined();
    expect(queryClient.getQueryData(bookQueryKeys.recommendation(1, 20))).toBeUndefined();
  });

  it('patches an updated book without refetching the legacy list', () => {
    const original = makeBook(7, {libraryName: 'Original'});
    const updated = makeBook(7, {libraryName: 'Updated'});
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [original]);

    service.handleBookUpdate(updated);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([updated]);
    expect(invalidateSpy).not.toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(7)});
  });

  it('does not refetch an active legacy list for a full book update', () => {
    const original = makeBook(7, {libraryName: 'Original'});
    const updated = makeBook(7, {libraryName: 'Updated'});
    const legacyBooks = observeActiveQuery(queryClient, BOOKS_QUERY_KEY, [original]);

    service.handleBookUpdate(updated);
    flushSocketChanges();

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([updated]);
    expect(legacyBooks.fetchCount()).toBe(0);
    legacyBooks.finish();
  });

  it('invalidates clean queries without inserting a legacy update payload into them', () => {
    const cleanDetail: BookDetail = {
      id: 7,
      libraryId: 1,
      libraryName: 'Clean library',
      metadata: {bookId: 7, title: 'Clean detail'},
    };
    queryClient.setQueryData(bookQueryKeys.detail(7, false), cleanDetail);
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [makeBook(7)]);

    service.handleBookUpdate(makeBook(7, {libraryName: 'Legacy update'}));

    expect(queryClient.getQueryData(bookQueryKeys.detail(7, false))).toBe(cleanDetail);
  });

  it('accepts the watcher ID-array update shape and invalidates instead of caching it as a book', () => {
    const original = makeBook(8);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [original]);

    service.handleBookUpdate([8]);
    flushSocketChanges();

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([original]);
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(8)});
  });

  it('reconciles a known metadata book ID without requiring a legacy payload', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    service.handleBookMetadataUpdate(14);
    flushSocketChanges();

    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(14)});
  });

  it('patches multiple cover timestamps and invalidates their detail queries', () => {
    const first = makeBook(3);
    const second = makeBook(4, {
      metadata: {
        bookId: 4,
        title: 'Book 4',
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [first, second]);

    service.handleMultipleBookCoverPatches([{id: 3, coverUpdatedOn: '2026-03-26T12:34:00Z'}]);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([
      {
        ...first,
        metadata: {
          ...first.metadata,
          coverUpdatedOn: '2026-03-26T12:34:00Z',
        },
      },
      second,
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'detail', 3]});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'recommendations']});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'query', 'collection']});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'query', 'detail', 3]});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'query', 'batch']});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'query', 'recommendation']});
  });

  it('ignores empty cover patch lists', () => {
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

    service.handleMultipleBookCoverPatches([]);

    expect(setQueryDataSpy).not.toHaveBeenCalled();
  });

  it.each([
    {method: 'handleNewlyCreatedBook', payload: null},
    {method: 'handleNewlyCreatedBook', payload: {id: 0}},
    {method: 'handleBookUpdate', payload: {title: 'No ID'}},
    {method: 'handleBookUpdate', payload: [0]},
    {method: 'handleBookMetadataUpdate', payload: 0},
    {method: 'handleRemovedBookIds', payload: [1, 'two']},
    {method: 'handleMultipleBookCoverPatches', payload: [{id: 1, coverUpdatedOn: 123}]},
  ])('ignores malformed $method payloads without touching either cache', ({method, payload}) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');
    const removeQueriesSpy = vi.spyOn(queryClient, 'removeQueries');

    (service[method as keyof BookSocketService] as (value: unknown) => void)(payload);

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(setQueryDataSpy).not.toHaveBeenCalled();
    expect(removeQueriesSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('ignores empty update, removal and cover events', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    service.handleBookUpdate([]);
    service.handleRemovedBookIds([]);
    service.handleMultipleBookCoverPatches([]);

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('coalesces socket bursts and lets deletion win over changes for the same book', async () => {
    const legacyBooks = observeActiveQuery(queryClient, BOOKS_QUERY_KEY, [makeBook(7), makeBook(8)]);
    const modernPage = observeActiveQuery(
      queryClient,
      bookQueryKeys.boundedPage(normalizeBookPageParams({
        size: 20,
        facets: {},
        facetLogic: 'or',
        sort: [],
      })),
      {content: [makeBook(7), makeBook(8)]},
    );
    const changedDetail = observeActiveQuery(
      queryClient,
      bookQueryKeys.detail(8, false),
      {id: 8},
    );
    const deletedDetailKey = bookQueryKeys.detail(7, false);
    queryClient.setQueryData(deletedDetailKey, {id: 7});

    for (let index = 0; index < 100; index += 1) {
      service.handleBookUpdate([7]);
    }
    service.handleRemovedBookIds([7]);
    service.handleBookUpdate([7]);
    service.handleBookUpdate([8]);

    expect(legacyBooks.fetchCount()).toBe(0);
    expect(modernPage.fetchCount()).toBe(0);
    flushSocketChanges();

    await vi.waitFor(() => {
      expect(legacyBooks.fetchCount()).toBe(1);
      expect(modernPage.fetchCount()).toBe(1);
      expect(changedDetail.fetchCount()).toBe(1);
    });
    expect(legacyBooks.abortCount()).toBe(0);
    expect(modernPage.abortCount()).toBe(0);
    expect(changedDetail.abortCount()).toBe(0);
    expect(queryClient.getQueryData(deletedDetailKey)).toBeUndefined();

    legacyBooks.finish();
    modernPage.finish();
    changedDetail.finish();
  });

  it('cancels a pending socket reconciliation when the service is destroyed', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    service.handleBookUpdate([7]);
    TestBed.resetTestingModule();
    flushSocketChanges();

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('invalidates recommendations when recommendation refresh completes', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    service.handleTaskProgress({
      taskId: 'task-1',
      taskType: 'UPDATE_BOOK_RECOMMENDATIONS',
      taskStatus: 'COMPLETED',
      progress: 100,
      message: 'Done',
    });

    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.recommendations()});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'recommendations']});
  });

  it.each([
    {taskId: 'task-1', taskType: 'UPDATE_BOOK_RECOMMENDATIONS', taskStatus: 'IN_PROGRESS'},
    {taskId: 'task-1', taskType: 'UPDATE_BOOK_RECOMMENDATIONS', taskStatus: 'FAILED'},
    {taskId: 'task-1', taskType: 'REFRESH_LIBRARY_METADATA', taskStatus: 'COMPLETED'},
    null,
  ])('does not reconcile books for an irrelevant or malformed task event', payload => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    service.handleTaskProgress(payload);

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('broadly invalidates clean and legacy book caches after reconnect', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    service.handleReconnect();

    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'detail']});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'recommendations']});
  });
});
