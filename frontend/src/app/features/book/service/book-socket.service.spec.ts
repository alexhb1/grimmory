import {TestBed} from '@angular/core/testing';
import {QueryClient} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Book} from '../model/book.model';
import {bookQueryKeys} from '../data/book-query-keys';
import {BookDetail} from '../data/book-response.models';
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

describe('BookSocketService', () => {
  let service: BookSocketService;
  let queryClient: QueryClient;

  beforeEach(() => {
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
  });

  it('adds newly created books into the list cache', () => {
    const existing = makeBook(1);
    const created = makeBook(2);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [existing]);

    service.handleNewlyCreatedBook(created);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([existing, created]);
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

    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(queryClient.getQueryData(bookDetailQueryKey(1, false))).toBeUndefined();
    expect(queryClient.getQueryData(bookRecommendationsQueryKey(1, 20))).toBeUndefined();
    expect(queryClient.getQueryData(bookQueryKeys.detail(1, false))).toBeUndefined();
    expect(queryClient.getQueryData(bookQueryKeys.recommendation(1, 20))).toBeUndefined();
  });

  it('patches updated books directly into the list cache', () => {
    const original = makeBook(7, {libraryName: 'Original'});
    const updated = makeBook(7, {libraryName: 'Updated'});
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [original]);

    service.handleBookUpdate(updated);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([updated]);
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

    service.handleBookUpdate([8] as never);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([original]);
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(8)});
  });

  it.each([
    {id: 8},
    {id: 8, libraryId: 1, libraryName: ''},
    {id: 8, libraryId: 1, libraryName: 'Library', metadata: {bookId: 9}},
  ])('treats a partial object update as an ID-only change instead of replacing a full legacy book', payload => {
    const original = makeBook(8);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [original]);

    service.handleBookUpdate(payload);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([original]);
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(8)});
  });

  it('treats a partial create object as an ID-only change instead of inserting it', () => {
    const existing = makeBook(1);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [existing]);

    service.handleNewlyCreatedBook({id: 2});

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([existing]);
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(2)});
  });

  it('reconciles multiple full-book updates through both caches', () => {
    const first = makeBook(11, {libraryName: 'Old'});
    const second = makeBook(12, {libraryName: 'Old'});
    const firstUpdated = makeBook(11, {libraryName: 'New'});
    const secondUpdated = makeBook(12, {libraryName: 'New'});
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [first, second]);

    service.handleMultipleBookUpdates([firstUpdated, secondUpdated]);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([firstUpdated, secondUpdated]);
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(11)});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(12)});
  });

  it('invalidates an entire mixed batch rather than caching partial book objects', () => {
    const first = makeBook(11, {libraryName: 'Old'});
    const second = makeBook(12, {libraryName: 'Old'});
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [first, second]);

    service.handleMultipleBookUpdates([makeBook(11, {libraryName: 'New'}), {id: 12}]);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([first, second]);
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(11)});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(12)});
  });

  it('reconciles a known metadata book ID without requiring a legacy payload', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    service.handleBookMetadataUpdate(14);

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
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'query', 'collection']});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'query', 'detail', 3]});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'query', 'batch']});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['books', 'query', 'recommendation']});
    expect(invalidateSpy).toHaveBeenCalledTimes(5);
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
    {method: 'handleMultipleBookUpdates', payload: [{id: 1}, {title: 'No ID'}]},
    {method: 'handleRemovedBookIds', payload: [1, 'two']},
    {method: 'handleMultipleBookCoverPatches', payload: [{id: 1, coverUpdatedOn: 123}]},
  ])('ignores malformed $method payloads without touching either cache', ({method, payload}) => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');
    const removeQueriesSpy = vi.spyOn(queryClient, 'removeQueries');

    (service[method as keyof BookSocketService] as (value: unknown) => void)(payload);

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(setQueryDataSpy).not.toHaveBeenCalled();
    expect(removeQueriesSpy).not.toHaveBeenCalled();
  });

  it('ignores empty update, removal and cover events', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    service.handleBookUpdate([] as never);
    service.handleMultipleBookUpdates([]);
    service.handleRemovedBookIds([]);
    service.handleMultipleBookCoverPatches([]);

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

    expect(invalidateSpy).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.recommendations()});
  });

  it.each([
    {taskId: 'task-1', taskType: 'UPDATE_BOOK_RECOMMENDATIONS', taskStatus: 'IN_PROGRESS'},
    {taskId: 'task-1', taskType: 'UPDATE_BOOK_RECOMMENDATIONS', taskStatus: 'FAILED'},
    {taskId: 'task-1', taskType: 'REFRESH_LIBRARY_METADATA', taskStatus: 'COMPLETED'},
    {taskId: '', taskType: 'UPDATE_BOOK_RECOMMENDATIONS', taskStatus: 'COMPLETED'},
    {
      taskId: 'task-1',
      taskType: 'UPDATE_BOOK_RECOMMENDATIONS',
      taskStatus: 'COMPLETED',
      progress: '100',
      message: 'Done',
    },
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
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['app-books']});
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['app-filter-options']});
  });
});
