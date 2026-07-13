import {HttpTestingController} from '@angular/common/http/testing';
import {signal, type WritableSignal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Router, provideRouter} from '@angular/router';
import {QueryClient} from '@tanstack/angular-query-experimental';
import {Subject} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {getTranslocoModule} from '../../../core/testing/transloco-testing';
import {createQueryClientHarness, flushQueryAsync} from '../../../core/testing/query-testing';
import {BrowseGridComponent} from '../../../shared/components/browse/browse-grid/browse-grid.component';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {UrlHelperService} from '../../../shared/service/url-helper.service';
import {type BookPage} from '../data/book-query.models';
import {type BookSummary} from '../data/book-response.models';
import {ConfirmationService, MessageService} from 'primeng/api';

import {BookService} from '../service/book.service';
import {BookFileService} from '../service/book-file.service';
import {ShelfDefinitionQueryService} from '../data/shelf-definition-query.service';
import {BookDialogHelperService} from '../components/book-browser/book-dialog-helper.service';
import {UserService} from '../../settings/user-management/user.service';
import {EmailService} from '../../settings/email-v2/email.service';
import {
  BookBrowsePageComponent,
  assembleSparseBooks,
  neededPages,
  pagesToEvict,
} from './book-browse-page.component';

const PAGE_URL = `${API_CONFIG.BASE_URL}/api/v1/books/page`;
const FACETS_URL = `${API_CONFIG.BASE_URL}/api/v1/books/facets`;

function bookPage(ids: number[], totalElements = ids.length, pageNumber = 0): BookPage {
  return {
    content: ids.map(id => ({id, libraryId: 1, libraryName: 'Library'})),
    page: {
      number: pageNumber,
      size: 60,
      totalElements,
      totalPages: Math.ceil(totalElements / 60),
    },
    links: [],
  };
}

function book(id: number): BookSummary {
  return {id, libraryId: 1, libraryName: 'Library'};
}

function summaryPage(
  books: BookSummary[],
  totalElements = books.length,
  pageNumber = 0,
): BookPage {
  return {
    content: books,
    page: {
      number: pageNumber,
      size: 60,
      totalElements,
      totalPages: Math.ceil(totalElements / 60),
    },
    links: [],
  };
}

interface PageHarness {
  selection: {
    count(): number;
    toggle(book: BookSummary, index: number, shiftKey: boolean): void;
  };
  bulkBar(): {availableWidth: {set(value: number): void}} | undefined;
  onBulkEditAll(): void;
  onBulkEditOneByOne(): void;
  onBulkLockUnlockMetadata(): void;
  onBulkOrganizeFiles(): void;
  onBulkAttachFiles(): void;
}

describe('book browse window helpers', () => {
  it('derives every overlapping page plus a one-page margin', () => {
    expect(neededPages({start: 125, end: 244}, 60, 1_000)).toEqual([1, 2, 3, 4, 5]);
    expect(neededPages({start: 0, end: 59}, 60, 100)).toEqual([0, 1]);
    expect(neededPages({start: 60, end: 99}, 60, 100)).toEqual([0, 1]);
  });

  it('assembles retained pages at their absolute indexes with sparse gaps', () => {
    const pages = new Map<number, readonly BookSummary[]>([
      [0, [book(1), book(2)]],
      [2, [book(121), book(122)]],
    ]);

    const books = assembleSparseBooks(pages, 200, 60);

    expect(books).toHaveLength(200);
    expect(books[0]?.id).toBe(1);
    expect(books[1]?.id).toBe(2);
    expect(books[2]).toBeUndefined();
    expect(books[120]?.id).toBe(121);
    expect(books[121]?.id).toBe(122);
  });

  it('uses the loaded extent while total metadata is not known', () => {
    const books = assembleSparseBooks(new Map([[2, [book(121), book(122)]]]), null, 60);

    expect(books).toHaveLength(122);
    expect(books[119]).toBeUndefined();
    expect(books[120]?.id).toBe(121);
  });

  it('evicts the pages furthest from the current visible range', () => {
    const pageNumbers = Array.from({length: 45}, (_, pageNumber) => pageNumber);

    expect(pagesToEvict(pageNumbers, {start: 1_200, end: 1_259}, 60, 40))
      .toEqual([44, 43, 42, 41, 40]);
    expect(pagesToEvict(pageNumbers.slice(0, 40), {start: 0, end: 59}, 60, 40))
      .toEqual([]);
  });
});

describe('BookBrowsePageComponent', () => {
  let fixture: ComponentFixture<BookBrowsePageComponent>;
  let http: HttpTestingController;
  let queryClient: QueryClient;
  let currentUser: WritableSignal<{permissions: Record<string, boolean>} | null>;
  let appSettings: WritableSignal<{diskType: string} | null>;
  let dialogHelper: {
    openBulkMetadataEditDialog: ReturnType<typeof vi.fn>;
    openMultibookMetadataEditorDialog: ReturnType<typeof vi.fn>;
    openLockUnlockMetadataDialog: ReturnType<typeof vi.fn>;
    openFileMoverDialog: ReturnType<typeof vi.fn>;
    openBulkBookFileAttacherDialog: ReturnType<typeof vi.fn>;
  };

  function grid(): BrowseGridComponent<BookSummary> {
    return fixture.debugElement.query(By.directive(BrowseGridComponent))
      .componentInstance as BrowseGridComponent<BookSummary>;
  }

  function expectPageRequest(pageNumber: number) {
    flushFacetRegistry();
    return http.expectOne(request =>
      request.url === PAGE_URL &&
      request.params.get('sort') === 'title' &&
      request.params.get('size') === '60' &&
      request.params.get('page') === pageNumber.toString(),
    );
  }

  function flushFacetRegistry(): void {
    for (const request of http.match(candidate => candidate.url === FACETS_URL)) {
      request.flush({
        facets: [{
          metadata: {rel: 'sort', key: 'sort', title: 'Sort'},
          links: [
            {rel: 'sort', href: '', type: '', title: 'title ascending', value: 'title'},
            {rel: 'sort', href: '', type: '', title: 'title descending', value: '-title'},
          ],
        }],
      });
    }
  }

  function page(): PageHarness {
    return fixture.componentInstance as unknown as PageHarness;
  }

  async function loadAndSelect(books: BookSummary[]): Promise<PageHarness> {
    fixture.detectChanges();
    expectPageRequest(0).flush(summaryPage(books));
    await flushQueryAsync();
    fixture.detectChanges();

    const component = page();
    books.forEach((selectedBook, index) => component.selection.toggle(selectedBook, index, false));
    fixture.detectChanges();
    return component;
  }

  function moreMenuItem(label: string): HTMLElement | undefined {
    const menu = document.querySelector('app-menu[aria-label="More actions"]');
    return Array.from(menu?.querySelectorAll('app-menu-item') ?? [])
      .find(item => item.textContent?.includes(label)) as HTMLElement | undefined;
  }

  function metadataMenuItem(label: string): HTMLElement | undefined {
    return Array.from(document.querySelectorAll('app-menu[aria-label="Metadata"] app-menu-item'))
      .find(item => item.textContent?.includes(label)) as HTMLElement | undefined;
  }

  function bulkMetadataMenu(): HTMLElement {
    return Array.from(document.querySelectorAll('app-menu[aria-label="Metadata"]'))
      .find(menu => menu.textContent?.includes('Custom covers')
        || menu.textContent?.includes('Lock/Unlock metadata')) as HTMLElement;
  }

  function bulkMetadataItemLabels(): string[] {
    return Array.from(bulkMetadataMenu().querySelectorAll(':scope > app-menu-item'))
      .map(item => item.textContent?.trim() ?? '');
  }

  function bulkBarButton(label: string): HTMLButtonElement | undefined {
    const buttons = (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('app-bulk-actions-bar button');
    return Array.from(buttons).find(button => button.textContent?.includes(label));
  }

  function moreTrigger(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('button[aria-label="More actions"]');
  }

  function fitAllBulkVerbs(): void {
    page().bulkBar()?.availableWidth.set(2_000);
    fixture.detectChanges();
  }

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    queryClient.setDefaultOptions({queries: {retry: false}});
    currentUser = signal(null);
    appSettings = signal({diskType: 'LOCAL'});
    dialogHelper = {
      openBulkMetadataEditDialog: vi.fn().mockResolvedValue(null),
      openMultibookMetadataEditorDialog: vi.fn().mockResolvedValue(null),
      openLockUnlockMetadataDialog: vi.fn().mockResolvedValue(null),
      openFileMoverDialog: vi.fn().mockResolvedValue(null),
      openBulkBookFileAttacherDialog: vi.fn().mockResolvedValue(null),
    };

    TestBed.configureTestingModule({
      imports: [BookBrowsePageComponent, getTranslocoModule()],
      providers: [
        ...harness.providers,
        provideRouter([]),
        {
          provide: UrlHelperService,
          useValue: {
            getThumbnailUrl: (id: number) => `/thumb/${id}`,
            getAudiobookThumbnailUrl: (id: number) => `/audio-thumb/${id}`,
          },
        },
        {
          provide: ShelfDefinitionQueryService,
          useValue: {
            definitions: () => ({
              queryKey: ['shelves', 'query', 'definitions'] as const,
              queryFn: async () => [],
            }),
          },
        },
        {provide: BookService, useValue: {readBook: () => undefined}},
        {provide: UserService, useValue: {currentUser}},
        {provide: AppSettingsService, useValue: {appSettings}},
        {provide: BookDialogHelperService, useValue: dialogHelper},
        {provide: BookFileService, useValue: {}},
        {provide: EmailService, useValue: {}},
        {provide: ConfirmationService, useValue: {confirm: () => undefined}},
        {provide: MessageService, useValue: {add: () => undefined}},
      ],
    });

    fixture = TestBed.createComponent(BookBrowsePageComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('requests page zero on mount and maps pending state into the grid', () => {
    fixture.detectChanges();

    expect(grid().status()).toBe('pending');
    expect(grid().items()).toEqual([]);
    expect(grid().totalCount()).toBeNull();

    expectPageRequest(0).flush(bookPage([1, 2, 3], 42));
  });

  it('maps a successful page into a full-length sparse grid', async () => {
    fixture.detectChanges();

    expectPageRequest(0).flush(bookPage([1, 2, 3], 42));
    await flushQueryAsync();

    expect(grid().status()).toBe('success');
    expect(grid().items()).toHaveLength(42);
    expect(grid().items().slice(0, 4).map(item => item?.id)).toEqual([1, 2, 3, undefined]);
    expect(grid().totalCount()).toBe(42);
  });

  it('surfaces an initial page failure and retries page zero', async () => {
    fixture.detectChanges();

    expectPageRequest(0).flush('Could not load', {status: 400, statusText: 'Bad Request'});
    await flushQueryAsync();

    expect(grid().status()).toBe('error');

    grid().retryInitial.emit();
    expectPageRequest(0).flush(bookPage([1], 1));
    await flushQueryAsync();

    expect(grid().status()).toBe('success');
    expect(grid().items()[0]?.id).toBe(1);
  });

  it('fetches the landing window directly and exposes later failures to the retry pill', async () => {
    fixture.detectChanges();
    expectPageRequest(0).flush(bookPage([1], 600));
    await flushQueryAsync();

    grid().visibleRange.emit({start: 180, end: 239});
    await flushQueryAsync(1);

    expectPageRequest(2).flush(bookPage([121], 600, 2));
    expectPageRequest(3).flush('Could not load', {status: 400, statusText: 'Bad Request'});
    expectPageRequest(4).flush(bookPage([241], 600, 4));
    await flushQueryAsync();

    expect(grid().status()).toBe('success');
    expect(grid().nextPageError()).toBe(true);
    expect(grid().items()[120]?.id).toBe(121);
    expect(grid().items()[180]).toBeUndefined();
    expect(grid().items()[240]?.id).toBe(241);

    grid().retryNextPage.emit();
    expectPageRequest(3).flush(bookPage([181], 600, 3));
    await flushQueryAsync();

    expect(grid().nextPageError()).toBe(false);
    expect(grid().items()[180]?.id).toBe(181);
  });

  it('scopes page requests by the query URL param', async () => {
    await TestBed.inject(Router).navigate([], {queryParams: {query: 'warden'}});
    fixture.detectChanges();
    flushFacetRegistry();

    const request = http.expectOne(candidate =>
      candidate.url === PAGE_URL &&
      candidate.params.get('query') === 'warden' &&
      candidate.params.get('page') === '0',
    );
    request.flush(bookPage([1], 1));
    await flushQueryAsync();

    expect(grid().totalCount()).toBe(1);
  });

  it('shows the active query as a removable search chip', async () => {
    await TestBed.inject(Router).navigate([], {queryParams: {query: 'the warden'}});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    flushFacetRegistry();

    http.expectOne(candidate =>
      candidate.url === PAGE_URL && candidate.params.get('query') === 'the warden',
    ).flush(bookPage([1], 1));
    await flushQueryAsync();
    fixture.detectChanges();

    const searchChip = fixture.debugElement.query(By.css('app-tag'));
    expect(searchChip.nativeElement.textContent).toContain('Search:');
    expect(searchChip.nativeElement.textContent).toContain('the warden');

    searchChip.query(By.css('button')).nativeElement.click();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: {query: null},
      queryParamsHandling: 'merge',
    }));
  });

  it('shows a removable raw-label chip for a facet outside the loaded vocabulary', async () => {
    await TestBed.inject(Router).navigate([], {queryParams: {facet: 'read_status:READ'}});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    flushFacetRegistry();

    http.expectOne(candidate =>
      candidate.url === PAGE_URL && candidate.params.get('facet') === 'read_status:READ',
    ).flush(bookPage([1], 1));
    await flushQueryAsync();
    fixture.detectChanges();

    const chip = fixture.debugElement.query(By.css('app-tag'));
    expect(chip.nativeElement.textContent).toContain('read_status:');
    expect(chip.nativeElement.textContent).toContain('READ');

    chip.query(By.css('button')).nativeElement.click();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: {facet: null, facet_must: null, facet_not: null},
      queryParamsHandling: 'merge',
    }));
  });

  it('debounces typed text into the query param as one replaceUrl navigation', () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      expectPageRequest(0).flush(bookPage([1], 1));

      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
      const page = fixture.componentInstance as unknown as {
        onQueryDraftChange(value: string): void;
      };

      page.onQueryDraftChange('the war');
      page.onQueryDraftChange('the warden ');
      vi.advanceTimersByTime(299);
      expect(navigate).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: {query: 'the warden'},
        replaceUrl: true,
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the bulk metadata editor with the resolved selection', async () => {
    const onClose = new Subject<void>();
    dialogHelper.openBulkMetadataEditDialog.mockResolvedValue({onClose});
    const component = await loadAndSelect([book(11), book(12)]);

    component.onBulkEditAll();

    await vi.waitFor(() => expect(dialogHelper.openBulkMetadataEditDialog).toHaveBeenCalledOnce());
    const selectedIds = dialogHelper.openBulkMetadataEditDialog.mock.calls[0]?.[0] as Set<number>;
    expect([...selectedIds]).toEqual([11, 12]);
    expect(component.selection.count()).toBe(2);

    onClose.next();
    expect(component.selection.count()).toBe(0);
  });

  it('opens the one-by-one metadata editor with the resolved selection', async () => {
    const onClose = new Subject<void>();
    dialogHelper.openMultibookMetadataEditorDialog.mockResolvedValue({onClose});
    const component = await loadAndSelect([book(21), book(22)]);

    component.onBulkEditOneByOne();

    await vi.waitFor(() => expect(dialogHelper.openMultibookMetadataEditorDialog).toHaveBeenCalledOnce());
    const selectedIds = dialogHelper.openMultibookMetadataEditorDialog.mock.calls[0]?.[0] as Set<number>;
    expect([...selectedIds]).toEqual([21, 22]);
    expect(component.selection.count()).toBe(2);

    onClose.next();
    expect(component.selection.count()).toBe(0);
  });

  it('offers Edit all and Edit one by one from the bar Edit menu', async () => {
    currentUser.set({permissions: {canEditMetadata: true}});
    await loadAndSelect([book(41)]);

    fitAllBulkVerbs();

    expect(bulkBarButton('Edit')).toBeDefined();
    const editItems = Array.from(document.querySelectorAll('app-menu[aria-label="Edit"] app-menu-item'));
    expect(editItems.map(item => item.textContent?.trim())).toEqual(['Edit all', 'Edit one by one']);

    (editItems[0] as HTMLElement).click();
    await vi.waitFor(() => expect(dialogHelper.openBulkMetadataEditDialog).toHaveBeenCalledOnce());
  });

  it('folds Edit into the more menu as one submenu entry when the bar is narrow', async () => {
    currentUser.set({permissions: {canEditMetadata: true}});
    await loadAndSelect([book(42)]);

    expect(bulkBarButton('Edit')).toBeUndefined();
    expect(moreMenuItem('Edit')).toBeDefined();
    expect(moreMenuItem('Edit one by one')).toBeUndefined();
  });

  it('hides Lock/Unlock metadata without its permission', async () => {
    await loadAndSelect([book(23)]);

    expect(metadataMenuItem('Lock/Unlock metadata')).toBeUndefined();
  });

  it('shows only lock actions in Metadata for a lock-only user', async () => {
    currentUser.set({permissions: {canBulkLockUnlockMetadata: true}});
    await loadAndSelect([book(231)]);

    fitAllBulkVerbs();

    expect(bulkBarButton('Metadata')).toBeDefined();
    expect(bulkMetadataItemLabels()).toEqual([
      'Lock All',
      'Unlock All',
      'Lock/Unlock metadata',
    ]);
    expect(bulkMetadataMenu().querySelectorAll(':scope > app-menu-separator')).toHaveLength(0);
  });

  it('shows only fetch and cover actions in Metadata for an edit-only user', async () => {
    currentUser.set({permissions: {canEditMetadata: true}});
    await loadAndSelect([book(232)]);

    fitAllBulkVerbs();

    expect(bulkBarButton('Metadata')).toBeDefined();
    expect(bulkMetadataItemLabels()).toEqual([
      'Fetch metadata',
      'Fetch with options…',
      'Regenerate covers',
      'Custom covers',
    ]);
    expect(bulkMetadataMenu().querySelectorAll(':scope > app-menu-separator')).toHaveLength(1);
  });

  it('opens Lock/Unlock metadata with the resolved selection and clears it on close', async () => {
    const onClose = new Subject<void>();
    dialogHelper.openLockUnlockMetadataDialog.mockResolvedValue({onClose});
    currentUser.set({permissions: {canBulkLockUnlockMetadata: true, canEditMetadata: true}});
    const component = await loadAndSelect([book(24), book(25)]);

    metadataMenuItem('Lock/Unlock metadata')?.click();

    await vi.waitFor(() => expect(dialogHelper.openLockUnlockMetadataDialog).toHaveBeenCalledOnce());
    const selectedIds = dialogHelper.openLockUnlockMetadataDialog.mock.calls[0]?.[0] as Set<number>;
    expect([...selectedIds]).toEqual([24, 25]);
    expect(component.selection.count()).toBe(2);

    onClose.next();
    expect(component.selection.count()).toBe(0);
  });

  it('opens the file organizer with the resolved selection', async () => {
    const onClose = new Subject<void>();
    dialogHelper.openFileMoverDialog.mockResolvedValue({onClose});
    const component = await loadAndSelect([book(31), book(32)]);

    component.onBulkOrganizeFiles();

    await vi.waitFor(() => expect(dialogHelper.openFileMoverDialog).toHaveBeenCalledOnce());
    const selectedIds = dialogHelper.openFileMoverDialog.mock.calls[0]?.[0] as Set<number>;
    expect([...selectedIds]).toEqual([31, 32]);

    onClose.next();
    expect(component.selection.count()).toBe(2);
  });

  it('opens the file attacher with the selected loaded books and clears after success', async () => {
    const onClose = new Subject<{success?: boolean} | undefined>();
    dialogHelper.openBulkBookFileAttacherDialog.mockResolvedValue({onClose});
    const selectedBooks = [book(41), book(42)];
    const component = await loadAndSelect(selectedBooks);

    component.onBulkAttachFiles();

    await vi.waitFor(() => expect(dialogHelper.openBulkBookFileAttacherDialog).toHaveBeenCalledOnce());
    const sourceBooks = dialogHelper.openBulkBookFileAttacherDialog.mock.calls[0]?.[0] as BookSummary[];
    expect(sourceBooks.map(sourceBook => sourceBook.id)).toEqual([41, 42]);
    expect(component.selection.count()).toBe(2);

    onClose.next({success: true});
    expect(component.selection.count()).toBe(0);
  });

  it('keeps the selection when the file attacher closes without success', async () => {
    const onClose = new Subject<{success?: boolean} | undefined>();
    dialogHelper.openBulkBookFileAttacherDialog.mockResolvedValue({onClose});
    const component = await loadAndSelect([book(51), book(52)]);

    component.onBulkAttachFiles();
    await vi.waitFor(() => expect(dialogHelper.openBulkBookFileAttacherDialog).toHaveBeenCalledOnce());

    onClose.next(undefined);
    expect(component.selection.count()).toBe(2);
  });

  it('shows Organize files only with its permission and local disk storage', async () => {
    await loadAndSelect([book(61)]);

    expect(moreMenuItem('Organize files')).toBeUndefined();

    currentUser.set({permissions: {canMoveOrganizeFiles: true}});
    appSettings.set({diskType: 'S3'});
    fixture.detectChanges();
    expect(moreMenuItem('Organize files')).toBeUndefined();

    appSettings.set({diskType: 'LOCAL'});
    fixture.detectChanges();
    expect(moreMenuItem('Organize files')).toBeDefined();
  });

  it('hides Attach files without library-management permission', async () => {
    await loadAndSelect([book(71)]);

    expect(moreMenuItem('Attach files')).toBeUndefined();
  });

  it('disables Attach files when selected books span libraries', async () => {
    currentUser.set({permissions: {canManageLibrary: true}});
    await loadAndSelect([
      {id: 81, libraryId: 1, libraryName: 'One'},
      {id: 82, libraryId: 2, libraryName: 'Two'},
    ]);

    expect(moreMenuItem('Attach files')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('disables Attach files when a selected book is outside the loaded windows', async () => {
    currentUser.set({permissions: {admin: true}});
    await loadAndSelect([book(91), book(92)]);

    await TestBed.inject(Router).navigate([], {queryParams: {query: 'one loaded book'}});
    fixture.detectChanges();
    http.expectOne(candidate =>
      candidate.url === PAGE_URL && candidate.params.get('query') === 'one loaded book',
    ).flush(summaryPage([book(91)]));
    await flushQueryAsync();
    fixture.detectChanges();

    expect(moreMenuItem('Attach files')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('enables Attach files with complete single-library evidence', async () => {
    currentUser.set({permissions: {canManageLibrary: true}});
    await loadAndSelect([book(101), book(102)]);

    expect(moreMenuItem('Attach files')?.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('hides the more trigger when every available verb fits', async () => {
    await loadAndSelect([book(111)]);

    fitAllBulkVerbs();

    expect(moreTrigger()).toBeNull();
  });

  it('shows the more trigger when a gated verb is available', async () => {
    currentUser.set({permissions: {canManageLibrary: true}});
    await loadAndSelect([book(121)]);

    fitAllBulkVerbs();

    expect(moreTrigger()).not.toBeNull();
  });

  it('sets the selected card metadata lock state through the book command', async () => {
    fixture.detectChanges();
    expectPageRequest(0).flush(bookPage([1], 1));
    await flushQueryAsync();
    const page = fixture.componentInstance as unknown as {
      menuBookSnapshot: {set(value: BookSummary): void};
      onMetadataLockChange(locked: boolean): void;
    };
    page.menuBookSnapshot.set({
      id: 1,
      libraryId: 1,
      libraryName: 'Library',
      metadata: {bookId: 1, allMetadataLocked: false},
    });

    page.onMetadataLockChange(true);
    await flushQueryAsync(1);

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-all-lock`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({bookIds: [1], lock: 'LOCK'});
    request.flush([{bookId: 1}]);
    await flushQueryAsync();
    expectPageRequest(0).flush(bookPage([1], 1));
    await flushQueryAsync();
  });
});
