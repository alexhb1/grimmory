import {computed, effect, inject, Injectable, Signal} from '@angular/core';
import {from, lastValueFrom, Observable, throwError} from 'rxjs';
import {HttpClient, HttpParams} from '@angular/common/http';
import {catchError, tap} from 'rxjs/operators';
import {Book, BookDeletionResponse, BookRecommendation, BookSetting, BookStatusUpdateResponse, BookType, CreatePhysicalBookRequest, PersonalRatingUpdateResponse, ReadStatus} from '../model/book.model';
import {API_CONFIG} from '../../../core/config/api-config';
import {MessageService} from 'primeng/api';
import {ResetProgressType} from '../../../shared/constants/reset-progress-type';
import {AuthService} from '../../../shared/service/auth.service';
import {Router} from '@angular/router';
import {BookSocketService} from './book-socket.service';
import {BookPatchService} from './book-patch.service';
import {TranslocoService} from '@jsverse/transloco';
import {injectQuery, queryOptions, QueryClient} from '@tanstack/angular-query-experimental';
import {
  BOOKS_QUERY_KEY,
  bookDetailQueryKey,
  bookRecommendationsQueryKey,
} from './book-query-keys';
import {
  invalidateBooksQuery,
  patchBooksInCache,
  removeBookQueries,
} from './book-query-cache';
import {BookSidebarCountsService} from './book-sidebar-counts.service';

const ALL_UNIQUE_METADATA_FIELDS = ['authors', 'categories', 'moods', 'tags', 'publishers', 'series'] as const;

type UniqueMetadataField = typeof ALL_UNIQUE_METADATA_FIELDS[number];

interface UniqueMetadataValues {
  authors: string[];
  categories: string[];
  moods: string[];
  tags: string[];
  publishers: string[];
  series: string[];
}

@Injectable({
  providedIn: 'root',
})
export class BookService {

  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/books`;

  private http = inject(HttpClient);
  private messageService = inject(MessageService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private bookSocketService = inject(BookSocketService);
  private bookPatchService = inject(BookPatchService);
  private queryClient = inject(QueryClient);
  private bookSidebarCountsService = inject(BookSidebarCountsService);
  private readonly t = inject(TranslocoService);
  private readonly token = this.authService.token;

  private booksQuery = injectQuery(() => ({
    ...this.getBooksQueryOptions(),
    enabled: !!this.token(),
  }));

  books = computed(() => this.booksQuery.data() ?? []);
  private readonly booksById = computed(() => {
    const index = new Map<number, Book>();
    for (const book of this.books()) {
      index.set(+book.id, book);
    }
    return index;
  });

  /** Unique metadata values used by autocomplete and metadata editors. */
  readonly uniqueMetadata = this.createUniqueMetadataSignal();

  booksError = computed<string | null>(() => {
    if (!this.token() || !this.booksQuery.isError()) {
      return null;
    }

    const error = this.booksQuery.error();
    return error instanceof Error ? error.message : 'Failed to load books';
  });

  isBooksLoading = computed(() => !!this.token() && this.booksQuery.isPending());

  constructor() {
    effect(() => {
      const token = this.token();
      if (token === null) {
        this.queryClient.removeQueries({queryKey: BOOKS_QUERY_KEY});
      }
    });
  }

  createUniqueMetadataSignal(fields: readonly UniqueMetadataField[] = ALL_UNIQUE_METADATA_FIELDS): Signal<UniqueMetadataValues> {
    const includeAuthors = fields.includes('authors');
    const includeCategories = fields.includes('categories');
    const includeMoods = fields.includes('moods');
    const includeTags = fields.includes('tags');
    const includePublishers = fields.includes('publishers');
    const includeSeries = fields.includes('series');

    return computed(() => {
      const authors = includeAuthors ? new Set<string>() : null;
      const categories = includeCategories ? new Set<string>() : null;
      const moods = includeMoods ? new Set<string>() : null;
      const tags = includeTags ? new Set<string>() : null;
      const publishers = includePublishers ? new Set<string>() : null;
      const series = includeSeries ? new Set<string>() : null;

      for (const book of this.books()) {
        const metadata = book.metadata;
        if (!metadata) continue;

        if (authors) metadata.authors?.forEach(value => authors.add(value));
        if (categories) metadata.categories?.forEach(value => categories.add(value));
        if (moods) metadata.moods?.forEach(value => moods.add(value));
        if (tags) metadata.tags?.forEach(value => tags.add(value));
        if (publishers && metadata.publisher) publishers.add(metadata.publisher);
        if (series && metadata.seriesName) series.add(metadata.seriesName);
      }

      return {
        authors: authors ? Array.from(authors) : [],
        categories: categories ? Array.from(categories) : [],
        moods: moods ? Array.from(moods) : [],
        tags: tags ? Array.from(tags) : [],
        publishers: publishers ? Array.from(publishers) : [],
        series: series ? Array.from(series) : [],
      };
    });
  }

  private getBooksQueryOptions() {
    return queryOptions({
      queryKey: BOOKS_QUERY_KEY,
      queryFn: () => lastValueFrom(this.http.get<Book[]>(this.url))
    });
  }

  bookDetailQueryOptions(bookId: number, withDescription: boolean) {
    return queryOptions({
      queryKey: bookDetailQueryKey(bookId, withDescription),
      queryFn: () => lastValueFrom(this.http.get<Book>(`${this.url}/${bookId}`, {
        params: {
          withDescription: withDescription.toString()
        }
      }))
    });
  }

  ensureBookDetail(bookId: number, withDescription: boolean): Promise<Book> {
    return this.queryClient.ensureQueryData(this.bookDetailQueryOptions(bookId, withDescription));
  }

  private getBookRecommendationsQueryOptions(bookId: number, limit: number) {
    return queryOptions({
      queryKey: bookRecommendationsQueryKey(bookId, limit),
      queryFn: () => lastValueFrom(this.http.get<BookRecommendation[]>(`${this.url}/${bookId}/recommendations`, {
        params: {limit: limit.toString()}
      }))
    });
  }

  removeBooksFromShelf(shelfId: number): void {
    this.queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, current =>
      (current ?? []).map(book => ({
        ...book,
        shelves: book.shelves?.filter(shelf => shelf.id !== shelfId),
      }))
    );
  }

  /*------------------ Book Retrieval ------------------*/

  findBookById(bookId: number): Book | undefined {
    return this.booksById().get(+bookId);
  }

  getBooksByIds(bookIds: number[]): Book[] {
    if (bookIds.length === 0) return [];
    const index = this.booksById();
    return bookIds
      .map(id => index.get(+id))
      .filter((book): book is Book => !!book);
  }

  getBooksInSeries(bookId: number): Observable<Book[]> {
    return this.http.get<Book[]>(`${this.url}/${bookId}/series`);
  }

  getBookRecommendations(bookId: number, limit: number = 20): Observable<BookRecommendation[]> {
    return from(this.queryClient.ensureQueryData(this.getBookRecommendationsQueryOptions(bookId, limit)));
  }

  /*------------------ Book Operations ------------------*/

  deleteBooks(ids: Set<number>): Observable<BookDeletionResponse> {
    const idList = Array.from(ids);
    const params = new HttpParams().set('ids', idList.join(','));

    return this.http.delete<BookDeletionResponse>(this.url, {params}).pipe(
      tap(response => {
        const deletedIds = response.deleted.length > 0 ? response.deleted : idList;
        invalidateBooksQuery(this.queryClient);
        removeBookQueries(this.queryClient, deletedIds);
        this.bookSidebarCountsService.invalidate();

        if (response.failedFileDeletions?.length > 0) {
          this.messageService.add({
            severity: 'warn',
            summary: this.t.translate('book.bookService.toast.someFilesNotDeletedSummary'),
            detail: this.t.translate('book.bookService.toast.someFilesNotDeletedDetail', {fileNames: response.failedFileDeletions.join(', ')}),
          });
        } else {
          this.messageService.add({
            severity: 'success',
            summary: this.t.translate('book.bookService.toast.booksDeletedSummary'),
            detail: this.t.translate('book.bookService.toast.booksDeletedDetail', {count: idList.length}),
          });
        }
      }),
      catchError(error => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('book.bookService.toast.deleteFailedSummary'),
          detail: error?.error?.message || error?.message || this.t.translate('book.bookService.toast.deleteFailedDetail'),
        });
        return throwError(() => error);
      })
    );
  }

  updateBookShelves(bookIds: Set<number | undefined>, shelvesToAssign: Set<number | null | undefined>, shelvesToUnassign: Set<number | null | undefined>): Observable<Book[]> {
    return this.bookPatchService.updateBookShelves(bookIds, shelvesToAssign, shelvesToUnassign);
  }

  createPhysicalBook(request: CreatePhysicalBookRequest): Observable<Book> {
    return this.http.post<Book>(`${this.url}/physical`, request).pipe(
      tap(newBook => {
        invalidateBooksQuery(this.queryClient);
        this.bookSidebarCountsService.invalidate();
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('book.bookService.toast.physicalBookCreatedSummary'),
          detail: this.t.translate('book.bookService.toast.physicalBookCreatedDetail', {title: newBook.metadata?.title || 'Book'})
        });
      }),
      catchError(error => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('book.bookService.toast.creationFailedSummary'),
          detail: error?.error?.message || error?.message || this.t.translate('book.bookService.toast.creationFailedDetail')
        });
        return throwError(() => error);
      })
    );
  }

  togglePhysicalFlag(bookId: number, physical: boolean): Observable<Book> {
    return this.http.patch<Book>(`${this.url}/${bookId}/physical`, null, {params: {physical}}).pipe(
      tap(updatedBook => {
        patchBooksInCache(this.queryClient, [updatedBook]);
      })
    );
  }

  /*------------------ Reading & Viewer Settings ------------------*/

  readBook(bookId: number, reader?: 'epub-streaming', explicitBookType?: BookType): void {
    const book = this.findBookById(bookId);

    if (!book) {
      console.error('Book not found');
      return;
    }

    const bookType: BookType | undefined = explicitBookType ?? book.primaryFile?.bookType;
    const isAlternativeFormat = explicitBookType && explicitBookType !== book.primaryFile?.bookType;

    let baseUrl: string | null = null;
    const queryParams: Partial<{streaming: true; bookType: BookType}> = {};

    switch (bookType) {
      case 'PDF':
        baseUrl = 'pdf-reader';
        break;

      case 'EPUB':
        baseUrl = 'ebook-reader';
        if (reader === 'epub-streaming') {
          queryParams['streaming'] = true;
        }
        break;

      case 'FB2':
      case 'MOBI':
      case 'AZW3':
        baseUrl = 'ebook-reader';
        break;

      case 'CBX':
        baseUrl = 'cbx-reader';
        break;

      case 'AUDIOBOOK':
        baseUrl = 'audiobook-player';
        break;
    }

    if (!baseUrl) {
      console.error('Unsupported book type:', bookType);
      return;
    }

    if (isAlternativeFormat) {
      queryParams['bookType'] = bookType;
    }

    const hasQueryParams = Object.keys(queryParams).length > 0;
    this.router.navigate([`/${baseUrl}/book/${book.id}`], hasQueryParams ? {queryParams} : undefined);

    this.updateLastReadTime(book.id);
  }

  getBookSetting(bookId: number, bookFileId: number): Observable<BookSetting> {
    return this.http.get<BookSetting>(`${this.url}/${bookId}/viewer-setting?bookFileId=${bookFileId}`);
  }

  updateViewerSetting(bookSetting: BookSetting, bookId: number): Observable<void> {
    return this.http.put<void>(`${this.url}/${bookId}/viewer-setting`, bookSetting);
  }

  /*------------------ Progress & Status Tracking ------------------*/

  updateLastReadTime(bookId: number): void {
    this.bookPatchService.updateLastReadTime(bookId);
  }

  savePdfProgress(bookId: number, page: number, percentage: number, bookFileId?: number): Observable<void> {
    return this.bookPatchService.savePdfProgress(bookId, page, percentage, bookFileId);
  }

  saveCbxProgress(bookId: number, page: number, percentage: number, bookFileId?: number): Observable<void> {
    return this.bookPatchService.saveCbxProgress(bookId, page, percentage, bookFileId);
  }

  updateDateFinished(bookId: number, dateFinished: string | null): Observable<void> {
    return this.bookPatchService.updateDateFinished(bookId, dateFinished);
  }

  resetProgress(bookIds: number | number[], type: ResetProgressType): Observable<BookStatusUpdateResponse[]> {
    return this.bookPatchService.resetProgress(bookIds, type);
  }

  updateBookReadStatus(bookIds: number | number[], status: ReadStatus): Observable<BookStatusUpdateResponse[]> {
    return this.bookPatchService.updateBookReadStatus(bookIds, status);
  }

  /*------------------ Personal Rating ------------------*/

  resetPersonalRating(bookIds: number | number[]): Observable<PersonalRatingUpdateResponse[]> {
    return this.bookPatchService.resetPersonalRating(bookIds);
  }

  updatePersonalRating(bookIds: number | number[], rating: number): Observable<PersonalRatingUpdateResponse[]> {
    return this.bookPatchService.updatePersonalRating(bookIds, rating);
  }

  /*------------------ Websocket Handlers ------------------*/

  handleNewlyCreatedBook(book: Book): void {
    this.bookSocketService.handleNewlyCreatedBook(book);
  }

  handleRemovedBookIds(removedBookIds: number[]): void {
    this.bookSocketService.handleRemovedBookIds(removedBookIds);
  }

  handleBookUpdate(updatedBook: Book): void {
    this.bookSocketService.handleBookUpdate(updatedBook);
  }

  handleMultipleBookUpdates(updatedBooks: Book[]): void {
    this.bookSocketService.handleMultipleBookUpdates(updatedBooks);
  }

  refreshBookDetail(bookId: number): void {
    this.bookSocketService.refreshBookDetail(bookId);
  }

  handleMultipleBookCoverPatches(patches: { id: number; coverUpdatedOn?: string; audiobookCoverUpdatedOn?: string }[]): void {
    this.bookSocketService.handleMultipleBookCoverPatches(patches);
  }
}
