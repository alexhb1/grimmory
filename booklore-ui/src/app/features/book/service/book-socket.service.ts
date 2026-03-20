import {inject, Injectable} from '@angular/core';
import {Book} from '../model/book.model';
import {QueryClient} from '@tanstack/angular-query-experimental';
import {
  addBookToCache,
  BookCoverTimestampPatch,
  invalidateBookDetailQueries,
  invalidateBooksQuery,
  patchBookCoverTimestampsInCache,
  patchBooksInCache,
  removeBookQueries,
} from './book-query-cache';
import {BookSidebarCountsService} from './book-sidebar-counts.service';

@Injectable({
  providedIn: 'root',
})
export class BookSocketService {
  private queryClient = inject(QueryClient);
  private bookSidebarCountsService = inject(BookSidebarCountsService);

  handleNewlyCreatedBook(book: Book): void {
    addBookToCache(this.queryClient, book);
    this.bookSidebarCountsService.invalidate();
  }

  handleRemovedBookIds(removedBookIds: number[]): void {
    invalidateBooksQuery(this.queryClient);
    removeBookQueries(this.queryClient, removedBookIds);
    this.bookSidebarCountsService.invalidate();
  }

  handleBookUpdate(updatedBook: Book): void {
    patchBooksInCache(this.queryClient, [updatedBook]);
  }

  handleMultipleBookUpdates(updatedBooks: Book[]): void {
    patchBooksInCache(this.queryClient, updatedBooks);
  }

  refreshBookDetail(bookId: number): void {
    invalidateBookDetailQueries(this.queryClient, [bookId]);
  }

  handleMultipleBookCoverPatches(patches: BookCoverTimestampPatch[]): void {
    patchBookCoverTimestampsInCache(this.queryClient, patches);
  }
}
