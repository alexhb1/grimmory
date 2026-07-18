import {beforeEach, describe, expect, it, vi} from 'vitest';
import {QueryClient, QueryObserver} from '@tanstack/angular-query-experimental';

import {Book, BookMetadata} from '../model/book.model';
import {bookQueryKeys} from '../data/book-query-keys';
import {normalizeBookBatchParams, normalizeBookPageParams} from '../data/book-query-params';
import {
  invalidateAllLegacyBooks,
  reconcileBookCacheChangeSet,
  reconcileLegacyBookChangeSet,
  invalidateBookQueries,
  invalidateBooksQuery,
  invalidateDeletedBookQueries,
  patchAttachedBookFilesInCache,
  patchBookFieldsInCache,
  patchBookInCacheWith,
  patchBookMetadataInCache,
  patchBooksInCache,
  patchBooksInCacheWith,
  patchBookCoversInCache,
  upsertBooksInCache,
} from './legacy-book-cache';
import {
  BOOKS_QUERY_KEY,
  bookDetailQueryKey,
  bookDetailQueryPrefix,
  bookRecommendationsQueryKey
} from './book-query-keys';

function makeBook(id: number, overrides: Partial<Book> = {}): Book {
  return {
    id,
    libraryId: 1,
    libraryName: 'Test Library',
    metadata: {
      bookId: id,
      title: `Book ${id}`
    },
    ...overrides
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

describe('legacy book cache adapter', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('applies changed-book invalidation to legacy caches only', () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    reconcileLegacyBookChangeSet(queryClient, {changedBookIds: [2, 2, 4]});

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(2)});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(4)});
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
  });

  it('refetches legacy recommendation snapshots when a book changes', async () => {
    const changedBook = makeBook(2);
    const recommendations = observeActiveQuery(
      queryClient,
      bookRecommendationsQueryKey(9, 20),
      [{book: changedBook, similarityScore: 0.8}],
    );

    const reconciliation = reconcileLegacyBookChangeSet(queryClient, {changedBookIds: [2]});

    await vi.waitFor(() => expect(recommendations.fetchCount()).toBe(1));
    expect(recommendations.abortCount()).toBe(0);
    recommendations.finish();
    await reconciliation;
  });

  it('refetches legacy recommendation snapshots when a cover changes', async () => {
    const changedBook = makeBook(2);
    const recommendations = observeActiveQuery(
      queryClient,
      bookRecommendationsQueryKey(9, 20),
      [{book: changedBook, similarityScore: 0.8}],
    );

    patchBookCoversInCache(queryClient, [
      {id: 2, coverUpdatedOn: '2026-07-17T20:00:00Z'},
    ]);

    await vi.waitFor(() => expect(recommendations.fetchCount()).toBe(1));
    expect(recommendations.abortCount()).toBe(0);
    recommendations.finish();
  });

  it('applies deleted-book removal to legacy caches only', () => {
    const firstBook = makeBook(1);
    const secondBook = makeBook(2);
    const removeQueriesSpy = vi.spyOn(queryClient, 'removeQueries');
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(bookDetailQueryKey(1, false), firstBook);
    queryClient.setQueryData(bookRecommendationsQueryKey(1, 20), [secondBook]);

    reconcileLegacyBookChangeSet(queryClient, {deletedBookIds: [1, 1]});

    expect(removeQueriesSpy).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(1)});
    expect(removeQueriesSpy).toHaveBeenCalledWith({queryKey: ['books', 'recommendations', 1]});
    expect(queryClient.getQueryData(bookDetailQueryKey(1, false))).toBeUndefined();
    expect(queryClient.getQueryData(bookRecommendationsQueryKey(1, 20))).toBeUndefined();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
  });

  it('removes a deleted source and refetches surviving legacy recommendations', async () => {
    const deletedBook = makeBook(1);
    const keptBook = makeBook(2);
    const deletedSource = observeActiveQuery(
      queryClient,
      bookRecommendationsQueryKey(1, 20),
      [{book: keptBook, similarityScore: 0.8}],
    );
    const survivingRecommendations = observeActiveQuery(
      queryClient,
      bookRecommendationsQueryKey(2, 20),
      [{book: deletedBook, similarityScore: 0.7}],
    );

    const reconciliation = reconcileLegacyBookChangeSet(queryClient, {deletedBookIds: [1]});

    await vi.waitFor(() => expect(survivingRecommendations.fetchCount()).toBe(1));
    expect(deletedSource.fetchCount()).toBe(0);
    expect(queryClient.getQueryData(bookRecommendationsQueryKey(1, 20))).toBeUndefined();
    survivingRecommendations.finish();
    deletedSource.finish();
    await reconciliation;
  });

  it('reconciles a mixed partial outcome with one refetch per shared legacy query', async () => {
    const deletedBook = makeBook(1);
    const uncertainBook = makeBook(201);
    const unattemptedBook = makeBook(401);
    const books = observeActiveQuery(
      queryClient,
      BOOKS_QUERY_KEY,
      [deletedBook, uncertainBook, unattemptedBook],
    );
    const deletedSource = observeActiveQuery(
      queryClient,
      bookRecommendationsQueryKey(1, 20),
      [{book: uncertainBook, similarityScore: 0.8}],
    );
    const survivingRecommendations = observeActiveQuery(
      queryClient,
      bookRecommendationsQueryKey(201, 20),
      [{book: deletedBook, similarityScore: 0.7}],
    );
    const uncertainDetail = observeActiveQuery(
      queryClient,
      bookDetailQueryKey(201, false),
      uncertainBook,
    );
    const unattemptedDetail = observeActiveQuery(
      queryClient,
      bookDetailQueryKey(401, false),
      unattemptedBook,
    );

    const reconciliation = reconcileLegacyBookChangeSet(queryClient, {
      deletedBookIds: [1],
      changedBookIds: [201],
    });

    await vi.waitFor(() => {
      expect(books.fetchCount()).toBe(1);
      expect(survivingRecommendations.fetchCount()).toBe(1);
      expect(uncertainDetail.fetchCount()).toBe(1);
    });
    expect(books.abortCount()).toBe(0);
    expect(survivingRecommendations.abortCount()).toBe(0);
    expect(uncertainDetail.abortCount()).toBe(0);
    expect(deletedSource.fetchCount()).toBe(0);
    expect(unattemptedDetail.fetchCount()).toBe(0);
    expect(queryClient.getQueryData(bookRecommendationsQueryKey(1, 20))).toBeUndefined();

    books.finish();
    deletedSource.finish();
    survivingRecommendations.finish();
    uncertainDetail.finish();
    unattemptedDetail.finish();
    await reconciliation;
  });

  it('applies whole-library invalidation to legacy caches only', () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateAllLegacyBooks(queryClient);

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: ['books', 'detail']});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: ['books', 'recommendations']});
    expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
  });

  it('invalidates the full books query and known changed books', () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateBooksQuery(queryClient);
    invalidateBookQueries(queryClient, [3, 3]);

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: ['books', 'detail']});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: ['books', 'recommendations']});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(3)});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
  });

  it('refetches active legacy and new queries after a whole-library change', async () => {
    const book = makeBook(1);
    const legacyBooks = observeActiveQuery(queryClient, BOOKS_QUERY_KEY, [book]);
    const legacyDetail = observeActiveQuery(queryClient, bookDetailQueryKey(1, false), book);
    const cleanPage = observeActiveQuery(
      queryClient,
      bookQueryKeys.boundedPage(normalizeBookPageParams({
        size: 20,
        facets: {},
        facetLogic: 'or',
        sort: [],
      })),
      {content: [book]},
    );
    const cleanDetail = observeActiveQuery(queryClient, bookQueryKeys.detail(1, false), book);

    invalidateBooksQuery(queryClient);

    await vi.waitFor(() => {
      expect(legacyBooks.fetchCount()).toBe(1);
      expect(legacyDetail.fetchCount()).toBe(1);
      expect(cleanPage.fetchCount()).toBe(1);
      expect(cleanDetail.fetchCount()).toBe(1);
    });
    for (const activeQuery of [legacyBooks, legacyDetail, cleanPage, cleanDetail]) {
      expect(activeQuery.abortCount()).toBe(0);
      activeQuery.finish();
    }
  });

  it('refetches active new queries once for a composed book update', async () => {
    const firstBook = makeBook(1);
    const detail = observeActiveQuery(queryClient, bookQueryKeys.detail(1, false), firstBook);
    const batch = observeActiveQuery(
      queryClient,
      bookQueryKeys.batch(normalizeBookBatchParams([1], false)),
      [firstBook],
    );
    const recommendations = observeActiveQuery(
      queryClient,
      bookQueryKeys.recommendation(1, 20),
      [firstBook],
    );

    invalidateBookQueries(queryClient, [1]);

    await vi.waitFor(() => {
      expect(detail.fetchCount()).toBe(1);
      expect(batch.fetchCount()).toBe(1);
      expect(recommendations.fetchCount()).toBe(1);
    });
    expect(detail.abortCount()).toBe(0);
    expect(batch.abortCount()).toBe(0);
    expect(recommendations.abortCount()).toBe(0);

    detail.finish();
    batch.finish();
    recommendations.finish();
  });

  it('patches a metadata-lock batch with one active refetch per new query', async () => {
    const firstBook = makeBook(1);
    const secondBook = makeBook(2);
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [firstBook, secondBook]);
    const page = observeActiveQuery(
      queryClient,
      bookQueryKeys.boundedPage(normalizeBookPageParams({
        size: 20,
        facets: {},
        facetLogic: 'or',
        sort: [],
      })),
      {content: [firstBook, secondBook]},
    );
    const firstDetail = observeActiveQuery(queryClient, bookQueryKeys.detail(1, false), firstBook);
    const secondDetail = observeActiveQuery(queryClient, bookQueryKeys.detail(2, false), secondBook);
    const batch = observeActiveQuery(
      queryClient,
      bookQueryKeys.batch(normalizeBookBatchParams([1, 2], false)),
      [firstBook, secondBook],
    );
    const recommendations = observeActiveQuery(
      queryClient,
      bookQueryKeys.recommendation(1, 20),
      [secondBook],
    );
    const legacyRecommendations = observeActiveQuery(
      queryClient,
      bookRecommendationsQueryKey(9, 20),
      [{book: firstBook, similarityScore: 0.8}],
    );

    patchBooksInCacheWith(queryClient, [
      {bookId: 1, updater: book => ({...book, metadata: {...(book.metadata ?? {bookId: book.id}), titleLocked: true}})},
      {bookId: 2, updater: book => ({...book, metadata: {...(book.metadata ?? {bookId: book.id}), titleLocked: true}})},
    ]);

    await vi.waitFor(() => {
      expect(page.fetchCount()).toBe(1);
      expect(firstDetail.fetchCount()).toBe(1);
      expect(secondDetail.fetchCount()).toBe(1);
      expect(batch.fetchCount()).toBe(1);
      expect(recommendations.fetchCount()).toBe(1);
      expect(legacyRecommendations.fetchCount()).toBe(1);
    });
    for (const activeQuery of [page, firstDetail, secondDetail, batch, recommendations, legacyRecommendations]) {
      expect(activeQuery.abortCount()).toBe(0);
      activeQuery.finish();
    }
  });

  it('patches an attachment change-set without duplicate active refetches', async () => {
    const targetBook = makeBook(10, {libraryName: 'Before attach'});
    const updatedTarget = makeBook(10, {libraryName: 'After attach'});
    const deletedSource = makeBook(11);
    const keptBook = makeBook(12);
    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [targetBook, deletedSource, keptBook]);
    queryClient.setQueryData(bookDetailQueryKey(11, false), deletedSource);
    queryClient.setQueryData(bookRecommendationsQueryKey(11, 20), [keptBook]);

    const page = observeActiveQuery(
      queryClient,
      bookQueryKeys.boundedPage(normalizeBookPageParams({
        size: 20,
        facets: {},
        facetLogic: 'or',
        sort: [],
      })),
      {content: [targetBook, deletedSource, keptBook]},
    );
    const changedDetail = observeActiveQuery(queryClient, bookQueryKeys.detail(10, false), targetBook);
    const deletedDetailKey = bookQueryKeys.detail(11, false);
    const deletedRecommendationKey = bookQueryKeys.recommendation(11, 20);
    const deletedDetail = observeActiveQuery(queryClient, deletedDetailKey, deletedSource);
    const deletedRecommendations = observeActiveQuery(
      queryClient,
      deletedRecommendationKey,
      [keptBook],
    );
    const batch = observeActiveQuery(
      queryClient,
      bookQueryKeys.batch(normalizeBookBatchParams([10, 11, 12], false)),
      [targetBook, deletedSource, keptBook],
    );
    const survivingRecommendations = observeActiveQuery(
      queryClient,
      bookQueryKeys.recommendation(12, 20),
      [targetBook, deletedSource],
    );
    const survivingLegacyRecommendations = observeActiveQuery(
      queryClient,
      bookRecommendationsQueryKey(12, 20),
      [{book: deletedSource, similarityScore: 0.7}],
    );

    patchAttachedBookFilesInCache(queryClient, updatedTarget, [11]);

    await vi.waitFor(() => {
      expect(page.fetchCount()).toBe(1);
      expect(changedDetail.fetchCount()).toBe(1);
      expect(batch.fetchCount()).toBe(1);
      expect(survivingRecommendations.fetchCount()).toBe(1);
      expect(survivingLegacyRecommendations.fetchCount()).toBe(1);
    });
    expect(deletedDetail.fetchCount()).toBe(0);
    expect(deletedRecommendations.fetchCount()).toBe(0);
    expect(queryClient.getQueryData(deletedDetailKey)).toBeUndefined();
    expect(queryClient.getQueryData(deletedRecommendationKey)).toBeUndefined();
    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([updatedTarget, keptBook]);
    expect(queryClient.getQueryData(bookDetailQueryKey(11, false))).toBeUndefined();
    expect(queryClient.getQueryData(bookRecommendationsQueryKey(11, 20))).toBeUndefined();
    for (const activeQuery of [page, changedDetail, batch, survivingRecommendations, survivingLegacyRecommendations]) {
      expect(activeQuery.abortCount()).toBe(0);
    }

    page.finish();
    changedDetail.finish();
    deletedDetail.finish();
    deletedRecommendations.finish();
    batch.finish();
    survivingRecommendations.finish();
    survivingLegacyRecommendations.finish();
  });

  it('removes deleted active leaves and refetches surviving dependents once', async () => {
    const deletedBook = makeBook(1);
    const keptBook = makeBook(2);
    const deletedDetailKey = bookQueryKeys.detail(1, false);
    const deletedRecommendationKey = bookQueryKeys.recommendation(1, 20);
    const deletedDetail = observeActiveQuery(queryClient, deletedDetailKey, deletedBook);
    const deletedRecommendations = observeActiveQuery(
      queryClient,
      deletedRecommendationKey,
      [keptBook],
    );
    const batch = observeActiveQuery(
      queryClient,
      bookQueryKeys.batch(normalizeBookBatchParams([1, 2], false)),
      [deletedBook, keptBook],
    );
    const remainingRecommendations = observeActiveQuery(
      queryClient,
      bookQueryKeys.recommendation(2, 20),
      [deletedBook],
    );
    const remainingLegacyRecommendations = observeActiveQuery(
      queryClient,
      bookRecommendationsQueryKey(2, 20),
      [{book: deletedBook, similarityScore: 0.6}],
    );

    invalidateDeletedBookQueries(queryClient, [1]);

    await vi.waitFor(() => {
      expect(batch.fetchCount()).toBe(1);
      expect(remainingRecommendations.fetchCount()).toBe(1);
      expect(remainingLegacyRecommendations.fetchCount()).toBe(1);
    });
    expect(deletedDetail.fetchCount()).toBe(0);
    expect(deletedRecommendations.fetchCount()).toBe(0);
    expect(batch.abortCount()).toBe(0);
    expect(remainingRecommendations.abortCount()).toBe(0);
    expect(remainingLegacyRecommendations.abortCount()).toBe(0);
    expect(queryClient.getQueryData(deletedDetailKey)).toBeUndefined();
    expect(queryClient.getQueryData(deletedRecommendationKey)).toBeUndefined();

    deletedDetail.finish();
    deletedRecommendations.finish();
    batch.finish();
    remainingRecommendations.finish();
    remainingLegacyRecommendations.finish();
  });

  it('patches list entries and invalidates matching detail queries', () => {
    const firstBook = makeBook(1);
    const secondBook = makeBook(2);
    const updatedSecondBook = makeBook(2, {
      libraryName: 'Updated Library'
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [firstBook, secondBook]);

    patchBooksInCache(queryClient, [updatedSecondBook]);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([firstBook, updatedSecondBook]);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(2)});
  });

  it('adds an authoritative new book without manufacturing an absent legacy cache', () => {
    const firstBook = makeBook(1);
    const updatedFirstBook = makeBook(1, {libraryName: 'Updated Library'});
    const createdBook = makeBook(2);

    upsertBooksInCache(queryClient, [createdBook]);
    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toBeUndefined();

    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [firstBook]);
    upsertBooksInCache(queryClient, [updatedFirstBook, createdBook]);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([
      updatedFirstBook,
      createdBook,
    ]);
  });

  it('patches metadata, selected fields, and updater callbacks in the list cache', () => {
    const firstBook = makeBook(1, {
      metadata: {
        bookId: 1,
        title: 'Original Title',
        authors: ['Old Author']
      }
    });
    const secondBook = makeBook(2, {
      metadata: {
        bookId: 2,
        title: 'Second'
      },
      libraryName: 'Library A'
    });
    const thirdBook = makeBook(3, {
      metadata: {
        bookId: 3,
        title: 'Third'
      }
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [firstBook, secondBook, thirdBook]);

    const updatedMetadata: BookMetadata = {
      bookId: 1,
      title: 'Updated Title'
    };

    patchBookMetadataInCache(queryClient, 1, updatedMetadata);
    patchBookFieldsInCache(queryClient, [
      {bookId: 2, fields: {libraryName: 'Updated Library'}},
      {bookId: 3, fields: {personalRating: 4}}
    ]);
    patchBookInCacheWith(queryClient, 1, book => ({
      ...book,
      metadata: {
        ...(book.metadata ?? {bookId: book.id}),
        authors: ['New Author']
      }
    }));

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([
      {
        ...firstBook,
        metadata: {
          ...firstBook.metadata,
          title: 'Updated Title',
          authors: ['New Author']
        }
      },
      {
        ...secondBook,
        libraryName: 'Updated Library'
      },
      {
        ...thirdBook,
        personalRating: 4
      }
    ]);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(1)});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(2)});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(3)});
  });

  it('preserves legacy list invalidation when a changed-id operation is empty', () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateBookQueries(queryClient, []);

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
  });

  it('starts permanent reconciliation even when legacy reconciliation throws synchronously', async () => {
    const legacyFailure = new Error('legacy reconciliation failed');
    let finishPermanentReconciliation: (() => void) | undefined;
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(filters => {
      if (filters?.queryKey === BOOKS_QUERY_KEY && filters.exact === true) {
        throw legacyFailure;
      }
      if (JSON.stringify(filters?.queryKey) === JSON.stringify(bookQueryKeys.collections())) {
        return new Promise(resolve => {
          finishPermanentReconciliation = resolve;
        });
      }
      return Promise.resolve();
    });

    const outcome = reconcileBookCacheChangeSet(
      queryClient,
      {changedBookIds: [1]},
      {legacyList: 'needs-refetch'},
    ).catch(error => error);

    await vi.waitFor(() => expect(finishPermanentReconciliation).toBeTypeOf('function'));
    finishPermanentReconciliation?.();
    await expect(outcome).resolves.toBe(legacyFailure);
  });

});
