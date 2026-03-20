import {beforeEach, describe, expect, it, vi} from 'vitest';
import {QueryClient} from '@tanstack/angular-query-experimental';

import {Book} from '../model/book.model';
import {
  addBookToCache,
  patchBookCoverTimestampsInCache,
  patchBookMetadataInCache,
  patchBooksInCache,
  removeBookQueries
} from './book-query-cache';
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

describe('book-query-cache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('adds new books and replaces existing entries by id', () => {
    const firstBook = makeBook(1);
    const secondBook = makeBook(2);
    const updatedSecondBook = makeBook(2, {
      libraryName: 'Updated Library',
      metadata: {
        bookId: 2,
        title: 'Updated Book 2'
      }
    });

    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [firstBook]);

    addBookToCache(queryClient, secondBook);
    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([firstBook, secondBook]);

    addBookToCache(queryClient, updatedSecondBook);
    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([firstBook, updatedSecondBook]);
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
    expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
  });

  it('patches metadata in list and cached detail queries', () => {
    const metadata = {
      bookId: 1,
      title: 'Updated Book 1',
      publisher: 'Updated Publisher'
    };

    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [makeBook(1)]);
    queryClient.setQueryData(bookDetailQueryKey(1, false), makeBook(1, {
      metadata: {
        bookId: 1,
        title: 'Detail Book 1',
        description: 'kept on book, not metadata'
      }
    }));
    queryClient.setQueryData(bookDetailQueryKey(1, true), makeBook(1, {
      metadata: {
        bookId: 1,
        title: 'Detailed Book 1',
        description: 'Full description'
      }
    }));

    patchBookMetadataInCache(queryClient, 1, metadata);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)?.[0].metadata).toEqual(metadata);
    expect(queryClient.getQueryData<Book>(bookDetailQueryKey(1, false))?.metadata).toEqual(metadata);
    expect(queryClient.getQueryData<Book>(bookDetailQueryKey(1, true))?.metadata).toEqual(metadata);
  });

  it('patches ebook and audiobook cover timestamps without refetching', () => {
    const originalBook = makeBook(1, {
      metadata: {
        bookId: 1,
        title: 'Book 1',
        coverUpdatedOn: 'old-cover',
        audiobookCoverUpdatedOn: 'old-audio'
      }
    });

    queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [originalBook]);
    queryClient.setQueryData(bookDetailQueryKey(1, true), originalBook);

    patchBookCoverTimestampsInCache(queryClient, [{
      id: 1,
      coverUpdatedOn: 'new-cover',
      audiobookCoverUpdatedOn: 'new-audio'
    }]);

    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)?.[0].metadata?.coverUpdatedOn).toBe('new-cover');
    expect(queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)?.[0].metadata?.audiobookCoverUpdatedOn).toBe('new-audio');
    expect(queryClient.getQueryData<Book>(bookDetailQueryKey(1, true))?.metadata?.coverUpdatedOn).toBe('new-cover');
    expect(queryClient.getQueryData<Book>(bookDetailQueryKey(1, true))?.metadata?.audiobookCoverUpdatedOn).toBe('new-audio');
  });

  it('removes detail and recommendation queries for deleted books', () => {
    const firstBook = makeBook(1);
    const secondBook = makeBook(2);

    queryClient.setQueryData(bookDetailQueryKey(1, false), firstBook);
    queryClient.setQueryData(bookDetailQueryKey(1, true), firstBook);
    queryClient.setQueryData(bookRecommendationsQueryKey(1, 20), [secondBook]);
    queryClient.setQueryData(bookDetailQueryKey(2, false), secondBook);

    removeBookQueries(queryClient, [1]);

    expect(queryClient.getQueryData(bookDetailQueryKey(1, false))).toBeUndefined();
    expect(queryClient.getQueryData(bookDetailQueryKey(1, true))).toBeUndefined();
    expect(queryClient.getQueryData(bookRecommendationsQueryKey(1, 20))).toBeUndefined();
    expect(queryClient.getQueryData(bookDetailQueryKey(2, false))).toEqual(secondBook);
  });
});
