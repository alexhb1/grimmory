import {inject, Injectable} from '@angular/core';
import {Book} from '../model/book.model';
import {QueryClient} from '@tanstack/angular-query-experimental';
import {BOOKS_QUERY_KEY} from './book-query-keys';
import {
  addBookToCache,
  type BookCoverPatch,
  invalidateBookDetailQueries,
  invalidateBooksQuery,
  patchAppBooksCoverInCache,
  patchBooksInCache,
  removeBookQueries,
} from './book-query-cache';

@Injectable({
  providedIn: 'root',
})
export class BookSocketService {
  private queryClient = inject(QueryClient);

  handleNewlyCreatedBook(book: Book): void {
    addBookToCache(this.queryClient, book);
  }

  handleRemovedBookIds(removedBookIds: number[]): void {
    invalidateBooksQuery(this.queryClient);
    removeBookQueries(this.queryClient, removedBookIds);
  }

  handleBookUpdate(updatedBook: Book): void {
    patchBooksInCache(this.queryClient, [updatedBook]);
  }

  handleMultipleBookUpdates(updatedBooks: Book[]): void {
    patchBooksInCache(this.queryClient, updatedBooks);
  }

  handleBookMetadataUpdate(bookId: number): void {
    invalidateBooksQuery(this.queryClient);
    invalidateBookDetailQueries(this.queryClient, [bookId]);
  }

  handleMultipleBookCoverPatches(patches: BookCoverPatch[]): void {
    if (!patches || patches.length === 0) return;
    const patchMap = new Map(patches.map(p => [p.id, p]));
    this.queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
      (current ?? []).map(book => {
        const patch = patchMap.get(book.id);
        return patch && book.metadata
          ? {
            ...book,
            metadata: {
              ...book.metadata,
              ...('coverUpdatedOn' in patch ? {coverUpdatedOn: patch.coverUpdatedOn ?? undefined} : {}),
              ...('audiobookCoverUpdatedOn' in patch ? {audiobookCoverUpdatedOn: patch.audiobookCoverUpdatedOn ?? undefined} : {}),
            },
          }
          : book;
      })
    );
    patchAppBooksCoverInCache(this.queryClient, patches);
    invalidateBookDetailQueries(this.queryClient, patches.map(p => p.id));
  }
}
