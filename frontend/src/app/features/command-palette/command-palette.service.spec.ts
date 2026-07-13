import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageService } from 'primeng/api';
import { API_CONFIG } from '../../core/config/api-config';
import { createQueryClientHarness } from '../../core/testing/query-testing';
import { getTranslocoModule } from '../../core/testing/transloco-testing';
import { BookDialogHelperService } from '../book/components/book-browser/book-dialog-helper.service';
import { BookPage } from '../book/data/book-query.models';
import { BookQueryService } from '../book/data/book-query.service';
import { BookSummary } from '../book/data/book-response.models';
import { LibraryService } from '../book/service/library.service';
import { ShelfService } from '../book/service/shelf.service';
import { MagicShelfService } from '../magic-shelf/service/magic-shelf.service';
import { UrlHelperService } from '../../shared/service/url-helper.service';
import { UserService } from '../settings/user-management/user.service';
import { CustomSvgService } from '../../shared/services/custom-svg.service';
import { DialogLauncherService } from '../../shared/services/dialog-launcher.service';

import { CommandPaletteService } from './command-palette.service';

function makeBook(
  id: number,
  title: string | undefined,
  authors: string[] = [],
  overrides: Partial<BookSummary> = {},
): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    ...overrides,
    metadata: {
      bookId: id,
      authors,
      allMetadataLocked: false,
      ...(title == null ? {} : {title}),
      ...overrides.metadata,
    },
  };
}

describe('CommandPaletteService', () => {
  let service: CommandPaletteService;
  let http: HttpTestingController;
  let urlHelper: {
    getThumbnailUrl: ReturnType<typeof vi.fn>;
    getAudiobookThumbnailUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  beforeEach(() => {
    const queryHarness = createQueryClientHarness();
    urlHelper = {
      getThumbnailUrl: vi.fn(() => null),
      getAudiobookThumbnailUrl: vi.fn(() => null),
    };

    TestBed.configureTestingModule({
      imports: [getTranslocoModule()],
      providers: [
        ...queryHarness.providers,
        { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
        BookQueryService,
        { provide: ShelfService, useValue: { shelves: signal([]) } },
        { provide: MagicShelfService, useValue: { shelves: signal([]) } },
        { provide: LibraryService, useValue: { libraries: signal([]) } },
        { provide: UserService, useValue: { currentUser: signal({ permissions: {} }) } },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: UrlHelperService, useValue: urlHelper },
        { provide: CustomSvgService, useValue: { getSvgIconContent: vi.fn(() => of('')) } },
        {
          provide: DialogLauncherService,
          useValue: {
            openLibraryCreateDialog: vi.fn(() => Promise.resolve(null)),
            openMagicShelfCreateDialog: vi.fn(() => Promise.resolve(null)),
            openFileUploadDialog: vi.fn(() => Promise.resolve(null)),
          },
        },
        {
          provide: BookDialogHelperService,
          useValue: {
            openShelfCreatorDialog: vi.fn(() => Promise.resolve(null)),
          },
        },
      ],
    });

    service = TestBed.inject(CommandPaletteService);
    http = TestBed.inject(HttpTestingController);
    TestBed.flushEffects();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function searchBooks(query: string, books: BookSummary[]): Promise<void> {
    service.open();
    service.query.set(query);
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(200);
    TestBed.flushEffects();

    const request = http.expectOne(
      `${API_CONFIG.BASE_URL}/api/v1/books/page?query=${encodeURIComponent(query)}&sort=title&size=50`,
    );
    const response: BookPage = {
      content: books,
      page: {
        number: 0,
        size: 50,
        totalElements: books.length,
        totalPages: 1,
      },
      links: [],
    };
    request.flush(response);
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.flushEffects();
  }

  it('queries matching book groups from the page endpoint after the debounce window', async () => {
    await searchBooks('tolkien', [
      makeBook(1, 'The Hobbit', ['J.R.R. Tolkien']),
      makeBook(2, 'The Fellowship of the Ring', ['J.R.R. Tolkien']),
    ]);

    const bookGroup = service.groups().find((group) => group.kind === 'book');

    expect(bookGroup).toBeDefined();
    expect(bookGroup?.items.map((item) => item.title)).toEqual([
      'The Hobbit',
      'The Fellowship of the Ring',
    ]);
  });

  it('does not show book groups for one-character searches', async () => {
    service.open();
    service.query.set('d');
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(200);
    TestBed.flushEffects();

    http.expectNone(request => request.url.endsWith('/api/v1/books/page'));
    expect(service.groups().find((group) => group.kind === 'book')).toBeUndefined();
  });

  it('does not search for eligible text while the palette is closed', async () => {
    service.query.set('dune');
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(200);
    TestBed.flushEffects();

    http.expectNone(request => request.url.endsWith('/api/v1/books/page'));
  });

  it('cancels an in-flight book search when debounced text changes', async () => {
    service.open();
    service.query.set('dune');
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(200);
    TestBed.flushEffects();
    const duneRequest = http.expectOne(request => request.urlWithParams.includes('query=dune'));

    service.query.set('tolkien');
    TestBed.flushEffects();
    await vi.advanceTimersByTimeAsync(200);
    TestBed.flushEffects();

    expect(duneRequest.cancelled).toBe(true);
    const tolkienRequest = http.expectOne(request => request.urlWithParams.includes('query=tolkien'));
    tolkienRequest.flush({
      content: [],
      page: {number: 0, size: 50, totalElements: 0, totalPages: 0},
      links: [],
    });
    TestBed.flushEffects();
  });

  it('hides results from the previous search while the next search is debouncing', async () => {
    await searchBooks('dune', [makeBook(3, 'Dune', ['Frank Herbert'])]);

    expect(service.groups().find((group) => group.kind === 'book')?.items[0]?.title).toBe('Dune');

    service.query.set('tolkien');
    TestBed.flushEffects();

    expect(service.groups().find((group) => group.kind === 'book')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(200);
    TestBed.flushEffects();
    const request = http.expectOne(request => request.urlWithParams.includes('query=tolkien'));
    request.flush({
      content: [],
      page: {number: 0, size: 50, totalElements: 0, totalPages: 0},
      links: [],
    });
    TestBed.flushEffects();
  });

  it('returns no groups when the query is empty', () => {
    service.query.set('');

    expect(service.groups()).toEqual([]);
    expect(service.visibleItems()).toEqual([]);
  });

  it('uses square audiobook metadata and audiobook thumbnails for audiobook results', async () => {
    urlHelper.getAudiobookThumbnailUrl.mockReturnValue('/audio-thumb.jpg');
    await searchBooks('audio', [
      makeBook(4, 'Audio Sample', ['Narrator'], {
        primaryFile: {
          id: 4,
          bookId: 4,
          book: true,
          folderBased: false,
          bookType: 'AUDIOBOOK',
        },
        metadata: {
          bookId: 4,
          title: 'Audio Sample',
          authors: ['Narrator'],
          audiobookCoverUpdatedOn: 'audio-updated',
          allMetadataLocked: false,
        },
      }),
    ]);

    const book = service.groups().find((group) => group.kind === 'book')?.items[0];

    expect(book?.bookMeta?.isAudiobook).toBe(true);
    expect(book?.bookMeta?.thumbnailUrl).toBe('/audio-thumb.jpg');
    expect(urlHelper.getAudiobookThumbnailUrl).toHaveBeenCalledWith(4, 'audio-updated');
    expect(urlHelper.getThumbnailUrl).not.toHaveBeenCalled();
  });

  it('falls back to the primary file name when summary metadata has no title', async () => {
    await searchBooks('untitled', [
      makeBook(5, undefined, [], {
        primaryFile: {
          id: 5,
          bookId: 5,
          fileName: 'untitled.epub',
          book: true,
          folderBased: false,
          bookType: 'EPUB',
        },
      }),
    ]);

    expect(service.groups().find((group) => group.kind === 'book')?.items[0]?.title)
      .toBe('untitled.epub');
  });
});
