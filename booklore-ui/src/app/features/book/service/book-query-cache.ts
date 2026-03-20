import {QueryClient} from '@tanstack/angular-query-experimental';

import {Book, BookMetadata} from '../model/book.model';
import {BOOKS_QUERY_KEY, bookDetailQueryPrefix, bookRecommendationsQueryPrefix} from './book-query-keys';

/**
 * Cache update rules for large libraries:
 * - Prefer surgical helpers when the API/socket payload identifies the exact book(s) that changed.
 * - Use broad invalidation only for async/bulk operations where the server may change many rows or
 *   when the payload is not authoritative enough to patch safely.
 * - If a change affects both list cards and open detail views, patch both caches in this file so the
 *   behavior stays consistent across services.
 */

export interface BookCoverTimestampPatch {
  id: number;
  coverUpdatedOn?: string;
  audiobookCoverUpdatedOn?: string;
}

// --- Full invalidation (refetches from server) ---

export function invalidateBooksQuery(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({queryKey: BOOKS_QUERY_KEY, exact: true});
}

export function invalidateBookQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  invalidateBooksQuery(queryClient);
  invalidateBookDetailQueries(queryClient, bookIds);
}

export function invalidateBookDetailQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  for (const bookId of new Set(bookIds)) {
    void queryClient.invalidateQueries({queryKey: bookDetailQueryPrefix(bookId)});
  }
}

export function removeBookQueries(queryClient: QueryClient, bookIds: Iterable<number>): void {
  for (const bookId of new Set(bookIds)) {
    queryClient.removeQueries({queryKey: bookDetailQueryPrefix(bookId)});
    queryClient.removeQueries({queryKey: bookRecommendationsQueryPrefix(bookId)});
  }
}

function patchCachedBooksList(
  queryClient: QueryClient,
  updater: (books: Book[]) => Book[]
): void {
  queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current => updater(current ?? []));
}

function patchCachedBookDetailQueries(
  queryClient: QueryClient,
  bookIds: Iterable<number>,
  updater: (book: Book, bookId: number) => Book
): void {
  for (const bookId of new Set(bookIds)) {
    for (const [queryKey, book] of queryClient.getQueriesData<Book>({queryKey: bookDetailQueryPrefix(bookId)})) {
      if (!book) continue;
      queryClient.setQueryData<Book>(queryKey, updater(book, bookId));
    }
  }
}

// --- Surgical patches (updates cache directly, no list refetch) ---

/** Upsert a full book row into the list cache when the payload is authoritative. */
export function addBookToCache(queryClient: QueryClient, book: Book): void {
  patchCachedBooksList(queryClient, books => {
    const exists = books.some(b => b.id === book.id);
    return exists ? books.map(b => b.id === book.id ? book : b) : [...books, book];
  });
}

/**
 * Patch list rows from authoritative Book payloads.
 * Detail queries are invalidated instead of patched because list rows may omit detail-only fields.
 */
export function patchBooksInCache(queryClient: QueryClient, updatedBooks: Book[]): void {
  const updatedMap = new Map(updatedBooks.map(book => [book.id, book]));
  patchCachedBooksList(queryClient, books =>
    books.map(book => updatedMap.get(book.id) ?? book)
  );
  invalidateBookDetailQueries(queryClient, updatedBooks.map(b => b.id));
}

/** Replace metadata in both list and cached detail queries when the metadata payload is authoritative. */
export function patchBookMetadataInCache(queryClient: QueryClient, bookId: number, metadata: BookMetadata): void {
  patchCachedBooksList(queryClient, books =>
    books.map(book =>
      book.id === bookId ? {...book, metadata} : book
    )
  );
  patchCachedBookDetailQueries(queryClient, [bookId], book => ({...book, metadata}));
}

/** Patch cover cache-busting timestamps without reloading the full books query. */
export function patchBookCoverTimestampsInCache(queryClient: QueryClient, patches: BookCoverTimestampPatch[]): void {
  if (patches.length === 0) return;

  const patchMap = new Map(patches.map(patch => [patch.id, patch]));

  patchCachedBooksList(queryClient, books =>
    books.map(book => {
      const patch = patchMap.get(book.id);
      if (!patch || !book.metadata) return book;

      return {
        ...book,
        metadata: {
          ...book.metadata,
          ...(patch.coverUpdatedOn !== undefined ? {coverUpdatedOn: patch.coverUpdatedOn} : {}),
          ...(patch.audiobookCoverUpdatedOn !== undefined ? {audiobookCoverUpdatedOn: patch.audiobookCoverUpdatedOn} : {}),
        }
      };
    })
  );

  patchCachedBookDetailQueries(queryClient, patchMap.keys(), (book, bookId) => {
    const patch = patchMap.get(bookId);
    if (!patch || !book.metadata) return book;

    return {
      ...book,
      metadata: {
        ...book.metadata,
        ...(patch.coverUpdatedOn !== undefined ? {coverUpdatedOn: patch.coverUpdatedOn} : {}),
        ...(patch.audiobookCoverUpdatedOn !== undefined ? {audiobookCoverUpdatedOn: patch.audiobookCoverUpdatedOn} : {}),
      }
    };
  });
}

/**
 * Patch a single list row with a client-side updater.
 * Detail queries are invalidated because this updater usually applies list-safe fields only.
 */
export function patchBookInCacheWith(queryClient: QueryClient, bookId: number, updater: (book: Book) => Book): void {
  patchCachedBooksList(queryClient, books =>
    books.map(book => book.id === bookId ? updater(book) : book)
  );
  invalidateBookDetailQueries(queryClient, [bookId]);
}

/** Patch specific top-level Book fields in list rows, then invalidate matching detail queries. */
export function patchBookFieldsInCache(queryClient: QueryClient, updates: {bookId: number; fields: Partial<Book>}[]): void {
  const updateMap = new Map(updates.map(u => [u.bookId, u.fields]));
  patchCachedBooksList(queryClient, books =>
    books.map(book => {
      const fields = updateMap.get(book.id);
      return fields ? {...book, ...fields} : book;
    })
  );
  invalidateBookDetailQueries(queryClient, updates.map(u => u.bookId));
}
