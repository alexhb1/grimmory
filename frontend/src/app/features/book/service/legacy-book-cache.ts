import {InfiniteData, QueryClient} from '@tanstack/angular-query-experimental';

import {
  invalidateAllBookQueries,
  invalidateBookCollections,
  applyBookQueryChangeSet,
} from '../data/book-query-cache';
import {Book, BookMetadata} from '../model/book.model';
import {AppBookSummary, AppPageResponse} from '../model/app-book.model';
import {BOOKS_QUERY_KEY, bookDetailQueryPrefix, bookRecommendationsQueryPrefix} from './book-query-keys';

const APP_BOOKS_QUERY_PREFIX = ['app-books'] as const;
const APP_FILTER_OPTIONS_QUERY_PREFIX = ['app-filter-options'] as const;

export type LegacyBookSocketCacheEvent =
  | {readonly kind: 'created'; readonly bookPayload: Readonly<Record<string, unknown>>}
  | {readonly kind: 'updated'; readonly bookPayloads: readonly Readonly<Record<string, unknown>>[]}
  | {readonly kind: 'changed'; readonly bookIds: readonly number[]}
  | {readonly kind: 'deleted'; readonly bookIds: readonly number[]}
  | {readonly kind: 'reconnect'}
  | {
    readonly kind: 'covers';
    readonly patches: readonly {readonly id: number; readonly coverUpdatedOn: string}[];
  };

function invalidateLegacyAppBookQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({queryKey: APP_BOOKS_QUERY_PREFIX});
  void queryClient.invalidateQueries({queryKey: APP_FILTER_OPTIONS_QUERY_PREFIX});
}

function invalidateLegacyBookDetails(queryClient: QueryClient, bookIds: Iterable<number>): void {
  for (const bookId of new Set(bookIds)) {
    void queryClient.invalidateQueries({queryKey: bookDetailQueryPrefix(bookId)});
  }
}

function removeLegacyBookQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  for (const bookId of new Set(bookIds)) {
    queryClient.removeQueries({queryKey: bookDetailQueryPrefix(bookId)});
    queryClient.removeQueries({queryKey: bookRecommendationsQueryPrefix(bookId)});
  }
}

export function invalidateLegacyChangedBooks(
  queryClient: QueryClient,
  bookIds: Iterable<number>,
): void {
  void queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true});
  invalidateLegacyBookDetails(queryClient, bookIds);
  invalidateLegacyAppBookQueries(queryClient);
}

export function removeLegacyDeletedBooks(
  queryClient: QueryClient,
  bookIds: Iterable<number>,
): void {
  void queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true});
  removeLegacyBookQueries(queryClient, bookIds);
  invalidateLegacyAppBookQueries(queryClient);
}

export function invalidateAllLegacyBooks(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true});
  void queryClient.invalidateQueries({queryKey: ['books', 'detail']});
  void queryClient.invalidateQueries({queryKey: ['books', 'recommendations']});
  invalidateLegacyAppBookQueries(queryClient);
}

export function reconcileLegacyBookSocketEvent(
  queryClient: QueryClient,
  event: LegacyBookSocketCacheEvent,
): void {
  switch (event.kind) {
    case 'created': {
      const createdBook = event.bookPayload as unknown as Book;
      addLegacyBookToCache(queryClient, createdBook);
      return;
    }
    case 'updated': {
      const updatedBooks = event.bookPayloads as unknown as readonly Book[];
      patchLegacyBooksInCache(queryClient, updatedBooks);
      return;
    }
    case 'changed':
      invalidateLegacyChangedBooks(queryClient, event.bookIds);
      return;
    case 'deleted':
      removeLegacyDeletedBooks(queryClient, event.bookIds);
      return;
    case 'reconnect':
      invalidateAllLegacyBooks(queryClient);
      return;
    case 'covers': {
      const patchMap = new Map(event.patches.map(patch => [patch.id, patch.coverUpdatedOn]));
      queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
        (current ?? []).map(book => {
          const coverUpdatedOn = patchMap.get(book.id);
          return coverUpdatedOn && book.metadata
            ? {...book, metadata: {...book.metadata, coverUpdatedOn}}
            : book;
        })
      );
      patchLegacyAppBooksCoverInCache(queryClient, event.patches);
      invalidateLegacyBookDetails(queryClient, patchMap.keys());
    }
  }
}

export function invalidateAppBooksQueries(queryClient: QueryClient): void {
  invalidateAllBookQueries(queryClient);
  invalidateLegacyAppBookQueries(queryClient);
}


export function invalidateBooksQuery(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true});
  invalidateAppBooksQueries(queryClient);
}

export function invalidateBookQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  const uniqueBookIds = new Set(bookIds);
  void queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true});
  invalidateLegacyAppBookQueries(queryClient);
  invalidateLegacyBookDetails(queryClient, uniqueBookIds);
  if (uniqueBookIds.size === 0) {
    invalidateBookCollections(queryClient);
    return;
  }
  applyBookQueryChangeSet(queryClient, {changedBookIds: uniqueBookIds});
}

export function invalidateBookDetailQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  const uniqueBookIds = new Set(bookIds);
  if (uniqueBookIds.size === 0) {
    return;
  }
  invalidateLegacyBookDetails(queryClient, uniqueBookIds);
  applyBookQueryChangeSet(queryClient, {changedBookIds: uniqueBookIds});
}

export function removeBookQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  const uniqueBookIds = new Set(bookIds);
  if (uniqueBookIds.size === 0) {
    return;
  }
  removeLegacyBookQueries(queryClient, uniqueBookIds);
  applyBookQueryChangeSet(queryClient, {deletedBookIds: uniqueBookIds});
}

export function invalidateDeletedBookQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  const deletedBookIds = new Set(bookIds);
  if (deletedBookIds.size === 0) {
    return;
  }

  void queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true});
  invalidateLegacyAppBookQueries(queryClient);
  removeLegacyBookQueries(queryClient, deletedBookIds);
  applyBookQueryChangeSet(queryClient, {deletedBookIds});
}

export function removeBooksFromCache(queryClient: QueryClient, bookIds: Iterable<number>): void {
  const removedIds = new Set(bookIds);
  if (removedIds.size === 0) {
    return;
  }

  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
    (current ?? []).filter(book => !removedIds.has(book.id))
  );
  removeLegacyBookQueries(queryClient, removedIds);
  invalidateLegacyAppBookQueries(queryClient);
  applyBookQueryChangeSet(queryClient, {deletedBookIds: removedIds});
}


export function addBookToCache(queryClient: QueryClient, book: Book): void {
  addLegacyBookToCache(queryClient, book);
  applyBookQueryChangeSet(queryClient, {changedBookIds: [book.id]});
}

function addLegacyBookToCache(queryClient: QueryClient, book: Book): void {
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current => {
    const books = current ?? [];
    const exists = books.some(b => b.id === book.id);
    return exists ? books.map(b => b.id === book.id ? book : b) : [...books, book];
  });
  invalidateLegacyBookDetails(queryClient, [book.id]);
  invalidateLegacyAppBookQueries(queryClient);
}

export function patchBooksInCache(queryClient: QueryClient, updatedBooks: Book[]): void {
  const updatedBookIds = patchLegacyBooksInCache(queryClient, updatedBooks);
  if (updatedBookIds.size === 0) {
    invalidateBookCollections(queryClient);
    return;
  }
  applyBookQueryChangeSet(queryClient, {changedBookIds: updatedBookIds});
}

function patchLegacyBooksInCache(
  queryClient: QueryClient,
  updatedBooks: readonly Book[],
): Set<number> {
  const updatedBookIds = new Set(updatedBooks.map(book => book.id));
  const updatedMap = new Map(updatedBooks.map(book => [book.id, book]));
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
    (current ?? []).map(book => updatedMap.get(book.id) ?? book)
  );
  invalidateLegacyBookDetails(queryClient, updatedBookIds);
  invalidateLegacyAppBookQueries(queryClient);
  return updatedBookIds;
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
  const updaterMap = new Map(updates.map(update => [update.bookId, update.updater]));
  const updatedBookIds = new Set(updaterMap.keys());
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
    (current ?? []).map(book => updaterMap.get(book.id)?.(book) ?? book)
  );
  invalidateLegacyBookDetails(queryClient, updatedBookIds);
  invalidateLegacyAppBookQueries(queryClient);
  if (updatedBookIds.size === 0) {
    invalidateBookCollections(queryClient);
    return;
  }
  applyBookQueryChangeSet(queryClient, {changedBookIds: updatedBookIds});
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
  invalidateLegacyBookDetails(queryClient, [updatedBook.id]);
  removeLegacyBookQueries(queryClient, deletedBookIds);
  invalidateLegacyAppBookQueries(queryClient);
  applyBookQueryChangeSet(queryClient, {
    changedBookIds: [updatedBook.id],
    deletedBookIds,
  });
}

export function patchAppBooksCoverInCache(
  queryClient: QueryClient,
  patches: {id: number; coverUpdatedOn?: string | null; audiobookCoverUpdatedOn?: string | null}[]
): void {
  if (patches.length === 0) return;
  patchLegacyAppBooksCoverInCache(queryClient, patches);
  invalidateLegacyBookDetails(queryClient, patches.map(patch => patch.id));
  applyBookQueryChangeSet(queryClient, {changedBookIds: patches.map(patch => patch.id)});
}

function patchLegacyAppBooksCoverInCache(
  queryClient: QueryClient,
  patches: readonly {id: number; coverUpdatedOn?: string | null; audiobookCoverUpdatedOn?: string | null}[],
): void {
  const patchMap = new Map(patches.map(patch => [patch.id, patch]));
  queryClient.setQueriesData<InfiniteData<AppPageResponse<AppBookSummary>>>(
    {queryKey: APP_BOOKS_QUERY_PREFIX},
    (current) => {
      if (!current) return current;
      return {
        ...current,
        pages: current.pages.map(page => ({
          ...page,
          content: page.content.map(summary => {
            const patch = patchMap.get(summary.id);
            if (!patch) return summary;
            return {
              ...summary,
              ...('coverUpdatedOn' in patch ? {coverUpdatedOn: patch.coverUpdatedOn ?? null} : {}),
              ...('audiobookCoverUpdatedOn' in patch ? {audiobookCoverUpdatedOn: patch.audiobookCoverUpdatedOn ?? null} : {}),
            };
          })
        }))
      };
    }
  );
}

export function patchAppBooksMetadataLockInCache(queryClient: QueryClient, bookId: number, allMetadataLocked: boolean): void {
  queryClient.setQueriesData<InfiniteData<AppPageResponse<AppBookSummary>>>(
    {queryKey: APP_BOOKS_QUERY_PREFIX},
    current => {
      if (!current) return current;

      return {
        ...current,
        pages: current.pages.map(page => ({
          ...page,
          content: page.content.map(summary =>
            summary.id === bookId ? {...summary, allMetadataLocked} : summary
          ),
        })),
      };
    }
  );
}
