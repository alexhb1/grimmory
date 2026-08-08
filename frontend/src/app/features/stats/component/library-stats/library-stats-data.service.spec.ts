import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { type BookSummary } from '../../../book/data/book-response.models';
import { AllBooksStatsSourceService } from '../shared/all-books-stats-source.service';
import { LibraryStatsDataService } from './library-stats-data.service';

describe('LibraryStatsDataService', () => {
  const books = signal<readonly BookSummary[]>([]);
  const language = new BehaviorSubject('en');
  const translate = vi.fn((key: string, params?: Record<string, unknown>) => {
    const id = params?.['id'];
    return typeof id === 'number' || typeof id === 'string' ? `${key}:${id}` : key;
  });

  beforeEach(() => {
    books.set([]);
    language.next('en');
    translate.mockClear();

    TestBed.configureTestingModule({
      providers: [
        LibraryStatsDataService,
        {
          provide: AllBooksStatsSourceService,
          useValue: { books, isLoading: signal(false), isError: signal(false) },
        },
        {
          provide: TranslocoService,
          useValue: {
            langChanges$: language,
            getActiveLang: () => language.value,
            translate,
          },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('owns the library options and selected library state', () => {
    books.set([
      { id: 1, libraryId: 2, libraryName: '', readStatus: ReadStatus.UNSET },
      { id: 2, libraryId: 1, libraryName: 'Alpha', readStatus: ReadStatus.UNSET },
      { id: 3, libraryId: 2, libraryName: 'Duplicate', readStatus: ReadStatus.UNSET },
    ]);
    const service = TestBed.inject(LibraryStatsDataService);

    expect(service.libraryOptions()).toEqual([
      { id: null, name: 'statsLibrary.libraryFilter.allLibraries' },
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'statsLibrary.libraryFilter.libraryFallback:2' },
    ]);

    service.setSelectedLibrary(2);
    expect(service.selectedLibrary()).toBe(2);

    service.setSelectedLibrary(99);
    expect(service.selectedLibrary()).toBeNull();
  });

  it('summarizes only books in the selected library', () => {
    books.set([
      {
        id: 1,
        libraryId: 1,
        libraryName: 'Alpha',
        readStatus: ReadStatus.UNREAD,
        metadata: { bookId: 1, authors: ['Ada'], allMetadataLocked: false },
      },
      {
        id: 2,
        libraryId: 2,
        libraryName: 'Beta',
        readStatus: ReadStatus.UNREAD,
        metadata: { bookId: 2, authors: ['Bob'], allMetadataLocked: false },
      },
    ]);
    const service = TestBed.inject(LibraryStatsDataService);

    service.setSelectedLibrary(2);

    expect(service.summaryStats()).toMatchObject({ totalBooks: 1, totalAuthors: 1 });
  });
});
