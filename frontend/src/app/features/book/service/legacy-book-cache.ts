import {QueryClient} from '@tanstack/angular-query-experimental';

import {
  invalidateAllBookQueries,
  invalidateBookCollections,
  applyBookQueryChangeSet,
} from '../data/book-query-cache';
import {Book, BookMetadata} from '../model/book.model';
import {
  BOOK_DETAIL_QUERY_PREFIX,
  BOOK_RECOMMENDATIONS_QUERY_PREFIX,
  BOOKS_QUERY_KEY,
  bookDetailQueryPrefix,
  bookRecommendationsQueryPrefix,
} from './book-query-keys';

interface BookCacheChangeSet {
  readonly changedBookIds?: Iterable<number>;
  readonly deletedBookIds?: Iterable<number>;
}

interface BookCacheReconciliationOptions {
  readonly legacyList: 'already-updated' | 'needs-refetch';
}

function removeLegacyBookQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  for (const bookId of new Set(bookIds)) {
    queryClient.removeQueries({queryKey: bookDetailQueryPrefix(bookId)});
    queryClient.removeQueries({queryKey: bookRecommendationsQueryPrefix(bookId)});
  }
}

export function reconcileLegacyBookChangeSet(
  queryClient: QueryClient,
  changeSet: BookCacheChangeSet,
): Promise<void> {
  const deletedBookIds = new Set(changeSet.deletedBookIds ?? []);
  const changedBookIds = new Set(changeSet.changedBookIds ?? []);
  for (const bookId of deletedBookIds) {
    changedBookIds.delete(bookId);
  }
  removeLegacyBookQueries(queryClient, deletedBookIds);

  return Promise.all([
    queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true}),
    ...[...changedBookIds].map(bookId => queryClient.invalidateQueries({
      queryKey: bookDetailQueryPrefix(bookId),
    })),
    invalidateLegacyBookRecommendations(queryClient),
  ]).then(() => undefined);
}

export function invalidateAllLegacyBooks(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true}),
    queryClient.invalidateQueries({queryKey: BOOK_DETAIL_QUERY_PREFIX}),
    queryClient.invalidateQueries({queryKey: BOOK_RECOMMENDATIONS_QUERY_PREFIX}),
  ]).then(() => undefined);
}

export function invalidateLegacyBookRecommendations(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({queryKey: BOOK_RECOMMENDATIONS_QUERY_PREFIX});
}

export function reconcileBookCacheChangeSet(
  queryClient: QueryClient,
  changeSet: BookCacheChangeSet,
  options: BookCacheReconciliationOptions,
): Promise<void> {
  const deletedBookIds = new Set(changeSet.deletedBookIds ?? []);
  const changedBookIds = new Set(changeSet.changedBookIds ?? []);
  for (const bookId of deletedBookIds) {
    changedBookIds.delete(bookId);
  }

  if (deletedBookIds.size === 0 && changedBookIds.size === 0) {
    return awaitBookCacheReconciliations([
      () => options.legacyList === 'needs-refetch'
        ? queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true})
        : undefined,
      () => invalidateBookCollections(queryClient),
    ]);
  }

  return awaitBookCacheReconciliations([
    () => options.legacyList === 'needs-refetch'
      ? reconcileLegacyBookChangeSet(queryClient, {changedBookIds, deletedBookIds})
      : reconcilePatchedLegacyBookChangeSet(queryClient, {changedBookIds, deletedBookIds}),
    () => applyBookQueryChangeSet(queryClient, {changedBookIds, deletedBookIds}),
  ]);
}

export async function awaitBookCacheReconciliations(
  reconciliations: readonly (() => unknown)[],
): Promise<void> {
  const pending = reconciliations.map(reconciliation => {
    try {
      return Promise.resolve(reconciliation());
    } catch (error) {
      return Promise.reject(error);
    }
  });
  const results = await Promise.allSettled(pending);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }
}

function reconcilePatchedLegacyBookChangeSet(
  queryClient: QueryClient,
  changeSet: {
    readonly changedBookIds: ReadonlySet<number>;
    readonly deletedBookIds: ReadonlySet<number>;
  },
): Promise<void> {
  removeLegacyBookQueries(queryClient, changeSet.deletedBookIds);
  return Promise.all([
    ...[...changeSet.changedBookIds].map(bookId => queryClient.invalidateQueries({
      queryKey: bookDetailQueryPrefix(bookId),
    })),
    invalidateLegacyBookRecommendations(queryClient),
  ]).then(() => undefined);
}

export function patchListOnlyBookFields(
  queryClient: QueryClient,
  updates: readonly {readonly bookId: number; readonly fields: Partial<Book>}[],
): Promise<void> {
  return patchListOnlyBooksWith(queryClient, updates.map(update => ({
    bookId: update.bookId,
    updater: book => ({...book, ...update.fields}),
  })));
}

export function patchListOnlyBooksWith(
  queryClient: QueryClient,
  updates: readonly {readonly bookId: number; readonly updater: (book: Book) => Book}[],
): Promise<void> {
  const updaterMap = new Map(updates.map(update => [update.bookId, update.updater]));
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
    (current ?? []).map(book => updaterMap.get(book.id)?.(book) ?? book)
  );
  return reconcilePatchedLegacyBookChangeSet(queryClient, {
    changedBookIds: new Set(updaterMap.keys()),
    deletedBookIds: new Set(),
  });
}

export function removeListOnlyBooks(
  queryClient: QueryClient,
  bookIds: Iterable<number>,
): Promise<void> {
  const deletedBookIds = new Set(bookIds);
  if (deletedBookIds.size === 0) {
    return Promise.resolve();
  }
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
    (current ?? []).filter(book => !deletedBookIds.has(book.id))
  );
  return reconcilePatchedLegacyBookChangeSet(queryClient, {
    changedBookIds: new Set(),
    deletedBookIds,
  });
}

export function patchBookCoversInCache(
  queryClient: QueryClient,
  patches: readonly {readonly id: number; readonly coverUpdatedOn: string}[],
): void {
  const patchMap = new Map(patches.map(patch => [patch.id, patch.coverUpdatedOn]));
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
    (current ?? []).map(book => {
      const coverUpdatedOn = patchMap.get(book.id);
      return coverUpdatedOn && book.metadata
        ? {...book, metadata: {...book.metadata, coverUpdatedOn}}
        : book;
    })
  );
  void reconcileBookCacheChangeSet(
    queryClient,
    {changedBookIds: patchMap.keys()},
    {legacyList: 'already-updated'},
  );
}

export function invalidateBooksQuery(queryClient: QueryClient): void {
  void awaitBookCacheReconciliations([
    () => invalidateAllLegacyBooks(queryClient),
    () => invalidateAllBookQueries(queryClient),
  ]);
}

export function invalidateBookQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  void reconcileBookCacheChangeSet(
    queryClient,
    {changedBookIds: bookIds},
    {legacyList: 'needs-refetch'},
  );
}

export function invalidateDeletedBookQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  const deletedBookIds = new Set(bookIds);
  if (deletedBookIds.size === 0) {
    return;
  }

  void reconcileBookCacheChangeSet(
    queryClient,
    {deletedBookIds},
    {legacyList: 'needs-refetch'},
  );
}

export function patchBooksInCache(queryClient: QueryClient, updatedBooks: Book[]): void {
  const updatedBookIds = new Set(updatedBooks.map(book => book.id));
  const updatedMap = new Map(updatedBooks.map(book => [book.id, book]));
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
    (current ?? []).map(book => updatedMap.get(book.id) ?? book)
  );
  void reconcileBookCacheChangeSet(
    queryClient,
    {changedBookIds: updatedBookIds},
    {legacyList: 'already-updated'},
  );
}

export function upsertBooksInCache(queryClient: QueryClient, updatedBooks: readonly Book[]): void {
  const updatedBookIds = new Set(updatedBooks.map(book => book.id));
  const updatedMap = new Map(updatedBooks.map(book => [book.id, book]));
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current => {
    if (!current) {
      return current;
    }
    const currentBookIds = new Set(current.map(book => book.id));
    return [
      ...current.map(book => updatedMap.get(book.id) ?? book),
      ...updatedBooks.filter(book => !currentBookIds.has(book.id)),
    ];
  });
  void reconcileBookCacheChangeSet(
    queryClient,
    {changedBookIds: updatedBookIds},
    {legacyList: 'already-updated'},
  );
}


export function patchBookMetadataInCache(queryClient: QueryClient, bookId: number, metadata: BookMetadata): void {
  patchBooksInCacheWith(queryClient, [{
    bookId,
    updater: book => ({...book, metadata}),
  }]);
}

export function patchBookInCacheWith(queryClient: QueryClient, bookId: number, updater: (book: Book) => Book): void {
  patchBooksInCacheWith(queryClient, [{bookId, updater}]);
}

export function patchBooksInCacheWith(
  queryClient: QueryClient,
  updates: {bookId: number; updater: (book: Book) => Book}[],
): void {
  const updatedBookIds = updates.map(update => update.bookId);
  void awaitBookCacheReconciliations([
    () => patchListOnlyBooksWith(queryClient, updates),
    () => applyBookQueryChangeSet(queryClient, {changedBookIds: updatedBookIds}),
  ]);
}

export function patchBookFieldsInCache(queryClient: QueryClient, updates: {bookId: number; fields: Partial<Book>}[]): void {
  patchBooksInCacheWith(queryClient, updates.map(update => ({
    bookId: update.bookId,
    updater: book => ({...book, ...update.fields}),
  })));
}

export function patchAttachedBookFilesInCache(
  queryClient: QueryClient,
  updatedBook: Book,
  deletedSourceBookIds: Iterable<number>,
): void {
  const deletedBookIds = new Set(deletedSourceBookIds);
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
    (current ?? [])
      .filter(book => !deletedBookIds.has(book.id))
      .map(book => book.id === updatedBook.id ? updatedBook : book)
  );
  void reconcileBookCacheChangeSet(
    queryClient,
    {changedBookIds: [updatedBook.id], deletedBookIds},
    {legacyList: 'already-updated'},
  );
}
