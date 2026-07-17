import {HttpTestingController} from '@angular/common/http/testing';
import {Component, signal, type WritableSignal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Router, provideRouter} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {QueryClient} from '@tanstack/angular-query-experimental';
import {Subject} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {getTranslocoModule} from '../../../core/testing/transloco-testing';
import {createQueryClientHarness, flushQueryAsync} from '../../../core/testing/query-testing';
import {BrowseGridComponent} from '../../../shared/components/browse/browse-grid/browse-grid.component';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {UrlHelperService} from '../../../shared/service/url-helper.service';
import {type PageLink} from '../data/book-query.models';
import {type BookSummary} from '../data/book-response.models';
import {ConfirmationService, MessageService} from 'primeng/api';
import {DialogService} from 'primeng/dynamicdialog';

import {BookService} from '../service/book.service';
import {BookFileService} from '../service/book-file.service';
import {LibraryService} from '../service/library.service';
import {LibraryShelfMenuService} from '../service/library-shelf-menu.service';
import {MagicShelfService} from '../../magic-shelf/service/magic-shelf.service';
import {ShelfDefinitionQueryService} from '../data/shelf-definition-query.service';
import {BookDialogHelperService} from '../service/book-dialog-helper.service';
import {UserService} from '../../settings/user-management/user.service';
import {EmailService} from '../../settings/email-v2/email.service';
import {BookBrowsePageComponent} from './book-browse-page.component';
import {buildSortOptions, type BookSortSelection} from './book-browse-sort.config';

const PAGE_URL = `${API_CONFIG.BASE_URL}/api/v1/books/page`;
const FACETS_URL = `${API_CONFIG.BASE_URL}/api/v1/books/facets`;

@Component({selector: 'app-test-route', template: ''})
class TestRouteComponent {}

function bookPage(
  ids: number[],
  totalElements = ids.length,
  links: PageLink[] = [],
) {
  return {
    content: ids.map(id => ({id, libraryId: 1, libraryName: 'Library'})),
    page: {
      number: 0,
      size: 60,
      totalElements,
      totalPages: Math.ceil(totalElements / 60),
    },
    links,
  };
}

function book(id: number): BookSummary {
  return {id, libraryId: 1, libraryName: 'Library'};
}

function summaryPage(
  books: BookSummary[],
  totalElements = books.length,
) {
  return {
    ...bookPage([], totalElements),
    content: books,
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
  onRetryInitial(): void;
  onSortChange(selection: BookSortSelection): void;
  onSortDirectionChange(selection: BookSortSelection): void;
}

describe('BookBrowsePageComponent', () => {
  let fixture: ComponentFixture<BookBrowsePageComponent>;
  let http: HttpTestingController;
  let queryClient: QueryClient;
  let currentUser: WritableSignal<{
    id?: number;
    permissions: Record<string, boolean>;
    userSettings?: {entityViewPreferences?: unknown};
  } | null>;
  let appSettings: WritableSignal<{diskType: string} | null>;
  let shelfDefinitions: {id: number; userId: number; name: string; visibility: 'private' | 'public'; bookCount: number; icon: null}[];
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

  function expectInitialPageRequest() {
    flushFacetRegistry();
    return http.expectOne(request =>
      request.url === PAGE_URL &&
      request.params.get('sort') === 'title' &&
      request.params.get('size') === '60' &&
      !request.params.has('page') &&
      !request.params.has('cursor'),
    );
  }

  function flushFacetRegistry(): void {
    for (const request of http.match(candidate => candidate.url === FACETS_URL)) {
      request.flush({
        links: [{rel: 'self', href: '/api/v1/books/facets', type: 'application/json'}],
        facets: [{
          metadata: {rel: 'sort', key: 'sort', title: 'Sort'},
          links: [
            {rel: 'sort', href: '', type: '', title: 'title ascending', value: 'title'},
            {rel: 'sort', href: '', type: '', title: 'title descending', value: '-title'},
            {rel: 'sort', href: '', type: '', title: 'page count', value: 'pageCount'},
          ],
        }],
      });
    }
  }

  function page(): PageHarness {
    return fixture.componentInstance as unknown as PageHarness;
  }

  function headerActionLabels(root: ParentNode): string[] {
    const menu = root.querySelector('app-menu[aria-label="More options"]');
    return Array.from(menu?.querySelectorAll(':scope > app-menu-item') ?? [])
      .map(item => item.textContent?.trim() ?? '');
  }

  async function loadAndSelect(books: BookSummary[]): Promise<PageHarness> {
    fixture.detectChanges();
    expectInitialPageRequest().flush(summaryPage(books));
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
        || menu.textContent?.includes('Lock/unlock metadata')) as HTMLElement;
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
    shelfDefinitions = [];
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
        provideRouter([
          {path: '', component: TestRouteComponent},
          {path: 'book/:bookId', component: TestRouteComponent},
          {path: 'library/:libraryId/books', children: [{path: '', component: BookBrowsePageComponent}]},
          {path: 'shelf/:shelfId/books', children: [{path: '', component: BookBrowsePageComponent}]},
          {path: 'magic-shelf/:magicShelfId/books', children: [{path: '', component: BookBrowsePageComponent}]},
          {path: 'unshelved-books', children: [
            {path: '', component: BookBrowsePageComponent, data: {browseScope: 'unshelved'}},
          ]},
        ]),
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
              queryFn: async () => shelfDefinitions,
            }),
          },
        },
        {provide: MagicShelfService, useValue: {shelves: () => [{id: 9, name: 'Witchy Reads'}]}},
        {provide: LibraryService, useValue: {libraries: () => [{id: 3, name: 'Cookbooks'}]}},
        {
          provide: LibraryShelfMenuService,
          useValue: {
            canManageShelf: () => true,
            canManageMagicShelf: () => true,
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
        {provide: DialogService, useValue: {open: () => null}},
      ],
    });

    fixture = TestBed.createComponent(BookBrowsePageComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    history.replaceState({}, '', '/');
  });

  it('requests the initial cursor page without page or cursor parameters', () => {
    fixture.detectChanges();

    expect(grid().status()).toBe('pending');
    expect(grid().items()).toEqual([]);
    expectInitialPageRequest().flush(bookPage([1, 2, 3], 42));
  });

  it('pins a library route scope as a facet the user cannot widen or remove', async () => {
    currentUser.set({permissions: {canManageLibrary: true}});
    fixture.destroy();
    const routerHarness = await RouterTestingHarness.create();
    await routerHarness.navigateByUrl('/library/3/books?facet=genre:Fantasy&facet=library:99');
    routerHarness.detectChanges();
    flushFacetRegistry();

    const request = http.expectOne(candidate =>
      candidate.url === PAGE_URL && !candidate.params.has('cursor'),
    );
    expect(request.request.params.getAll('facet')).toEqual(['genre:Fantasy', 'library:3']);
    request.flush(bookPage([1], 1));
    await flushQueryAsync();
    routerHarness.detectChanges();

    expect(routerHarness.routeNativeElement?.textContent).toContain('Cookbooks');
    expect(headerActionLabels(routerHarness.routeNativeElement!)).toEqual([
      'Add Physical Book',
      'Import ISBNs from File',
      'Edit Library',
      'Re-scan Library',
      'Custom Fetch Metadata',
      'Auto Fetch Metadata',
      'Find Duplicates',
      'Delete Library',
    ]);
  });

  it('supplies only shelf actions to the header menu on a shelf route', async () => {
    currentUser.set({permissions: {canManageLibrary: true}});
    shelfDefinitions = [{id: 5, userId: 7, name: 'Favorites', visibility: 'private', bookCount: 1, icon: null}];
    fixture.destroy();
    const routerHarness = await RouterTestingHarness.create();
    await routerHarness.navigateByUrl('/shelf/5/books');
    routerHarness.detectChanges();
    flushFacetRegistry();

    http.expectOne(candidate => candidate.url === PAGE_URL).flush(bookPage([1], 1));
    await flushQueryAsync();
    routerHarness.detectChanges();

    expect(headerActionLabels(routerHarness.routeNativeElement!)).toEqual(['Edit Shelf', 'Delete Shelf']);
  });

  it('scopes a magic shelf route and titles it with the shelf name', async () => {
    currentUser.set({permissions: {canManageLibrary: true}});
    fixture.destroy();
    const routerHarness = await RouterTestingHarness.create();
    await routerHarness.navigateByUrl('/magic-shelf/9/books');
    routerHarness.detectChanges();
    flushFacetRegistry();

    const request = http.expectOne(candidate => candidate.url === PAGE_URL);
    expect(request.request.params.getAll('facet')).toEqual(['shelf:magic:9']);
    request.flush(bookPage([1], 1));
    await flushQueryAsync();
    routerHarness.detectChanges();

    expect(routerHarness.routeNativeElement?.textContent).toContain('Witchy Reads');
    expect(headerActionLabels(routerHarness.routeNativeElement!)).toEqual([
      'Edit Magic Shelf',
      'Copy JSON',
      'Delete Magic Shelf',
    ]);
  });

  it('scopes the unshelved route through the shelf_status facet', async () => {
    currentUser.set({permissions: {canManageLibrary: true}});
    fixture.destroy();
    const routerHarness = await RouterTestingHarness.create();
    await routerHarness.navigateByUrl('/unshelved-books');
    routerHarness.detectChanges();
    flushFacetRegistry();

    const request = http.expectOne(candidate => candidate.url === PAGE_URL);
    expect(request.request.params.getAll('facet')).toEqual(['shelf_status:unshelved']);
    request.flush(bookPage([1], 1));
    await flushQueryAsync();
    routerHarness.detectChanges();

    expect(headerActionLabels(routerHarness.routeNativeElement!)).toEqual([]);
  });

  it('scopes facet discovery to the route scope', async () => {
    fixture.destroy();
    const routerHarness = await RouterTestingHarness.create();
    await routerHarness.navigateByUrl('/library/3/books');
    routerHarness.detectChanges();

    for (const facetsRequest of http.match(candidate => candidate.url === FACETS_URL)) {
      expect(facetsRequest.request.params.getAll('facet')).toEqual(['library:3']);
      facetsRequest.flush({facets: []});
    }
    http.expectOne(candidate => candidate.url === PAGE_URL).flush(bookPage([1], 1));
    await flushQueryAsync();
  });

  it('keeps the loaded window bounded by fetched pages, not by the reported total', async () => {
    fixture.detectChanges();
    const request = expectInitialPageRequest();
    expect(request.request.params.get('size')).toBe('60');
    request.flush(bookPage([1, 2, 3], 100_000));
    await flushQueryAsync();

    expect(grid().status()).toBe('success');
    expect(grid().items().map(item => item?.id)).toEqual([1, 2, 3]);
  });

  it('serves a remount from the shared parameter-keyed cache without refetching', async () => {
    fixture.detectChanges();
    expectInitialPageRequest().flush(bookPage([1, 2, 3], 100_000));
    await flushQueryAsync();

    fixture.destroy();
    fixture = TestBed.createComponent(BookBrowsePageComponent);
    fixture.detectChanges();
    await flushQueryAsync();

    http.expectNone(candidate => candidate.url === PAGE_URL);
    expect(grid().status()).toBe('success');
    expect(grid().items().map(item => item?.id)).toEqual([1, 2, 3]);
  });

  it('surfaces an initial page failure and retries page zero', async () => {
    fixture.detectChanges();

    expectInitialPageRequest().flush('Could not load', {status: 400, statusText: 'Bad Request'});
    await flushQueryAsync();

    expect(grid().status()).toBe('error');

    grid().retryInitial.emit();
    expectInitialPageRequest().flush(bookPage([1], 1));
    await flushQueryAsync();

    expect(grid().status()).toBe('success');
    expect(grid().items()[0]?.id).toBe(1);
  });

  it('follows the opaque next link and retries a continuation failure', async () => {
    fixture.detectChanges();
    expectInitialPageRequest().flush(bookPage([1], 600, [{
      rel: ['next'],
      href: '/api/v1/books/page?cursor=opaque%2Bcursor&sort=title&size=60',
      type: 'application/json',
    }]));
    await flushQueryAsync();

    grid().visibleRange.emit({start: 0, end: 0});
    await flushQueryAsync(1);

    const nextUrl = `${API_CONFIG.BASE_URL}/api/v1/books/page?cursor=opaque%2Bcursor&sort=title&size=60`;
    http.expectOne(nextUrl).flush('Could not load', {status: 400, statusText: 'Bad Request'});
    await flushQueryAsync();

    expect(grid().status()).toBe('success');
    expect(grid().nextPageError()).toBe(true);
    expect(grid().items().map(item => item?.id)).toEqual([1]);

    grid().retryNextPage.emit();
    http.expectOne(nextUrl).flush(bookPage([2], 600));
    await flushQueryAsync();

    expect(grid().nextPageError()).toBe(false);
    expect(grid().items().map(item => item?.id)).toEqual([1, 2]);
  });

  it('keeps the browse query untouched when only the view changes', async () => {
    fixture.detectChanges();
    expectInitialPageRequest().flush(bookPage([1], 1));
    await flushQueryAsync();

    await TestBed.inject(Router).navigate([], {queryParams: {view: 'grid'}});
    await fixture.whenStable();
    await flushQueryAsync(1);

    http.expectNone(candidate => candidate.url === PAGE_URL);
    expect(grid().items().map(item => item?.id)).toEqual([1]);
  });

  it('requests changed criteria fresh and reuses the cache when criteria return (A-B-A)', async () => {
    fixture.detectChanges();
    expectInitialPageRequest().flush(bookPage([1], 1));
    await flushQueryAsync();

    await TestBed.inject(Router).navigate([], {queryParams: {query: 'warden'}});
    await fixture.whenStable();
    flushFacetRegistry();
    http.expectOne(request =>
      request.url === PAGE_URL && request.params.get('query') === 'warden',
    ).flush(bookPage([2], 1));
    await flushQueryAsync();

    await TestBed.inject(Router).navigate([], {queryParams: {query: null}});
    await fixture.whenStable();
    await flushQueryAsync(1);

    http.expectNone(candidate => candidate.url === PAGE_URL);
    expect(grid().items().map(item => item?.id)).toEqual([1]);
  });

  it('preserves selected IDs when only ordering changes', async () => {
    fixture.detectChanges();
    expectInitialPageRequest().flush(bookPage([1, 2], 2));
    await flushQueryAsync();
    page().selection.toggle(book(1), 0, false);

    await TestBed.inject(Router).navigate([], {queryParams: {sort: '-title'}});
    await fixture.whenStable();
    http.expectOne(request =>
      request.url === PAGE_URL && request.params.get('sort') === '-title',
    ).flush(bookPage([2, 1], 2));
    await flushQueryAsync();

    expect(page().selection.count()).toBe(1);
  });

  it('clears selected IDs as soon as collection membership changes', async () => {
    fixture.detectChanges();
    expectInitialPageRequest().flush(bookPage([1, 2], 2));
    await flushQueryAsync();
    page().selection.toggle(book(1), 0, false);

    await TestBed.inject(Router).navigate([], {queryParams: {query: 'warden'}});
    await fixture.whenStable();

    expect(page().selection.count()).toBe(0);
    flushFacetRegistry();
    http.expectOne(request =>
      request.url === PAGE_URL && request.params.get('query') === 'warden',
    ).flush(bookPage([2], 1));
    await flushQueryAsync();
  });

  it('passes sort, search, and facet selections to the paginated endpoint exactly', async () => {
    await TestBed.inject(Router).navigate([], {
      queryParams: {
        sort: '-title,seriesName',
        query: '  warden  ',
        facet: ['genre:Fantasy', 'language:en'],
      },
    });
    fixture.detectChanges();
    flushFacetRegistry();

    http.expectOne(request =>
      request.url === PAGE_URL &&
      request.params.get('sort') === '-title,seriesName' &&
      request.params.get('query') === 'warden' &&
      request.params.getAll('facet')?.join(',') === 'genre:Fantasy,language:en',
    ).flush(bookPage([1], 1));
    await flushQueryAsync();
  });

  it('applies the saved default sort when the URL has none, skipping unsortable saved fields', async () => {
    currentUser.set({
      permissions: {},
      userSettings: {
        entityViewPreferences: {
          global: {
            sortKey: 'author',
            sortDir: 'ASC',
            sortCriteria: [
              {field: 'author', direction: 'ASC'},
              {field: 'title', direction: 'DESC'},
            ],
            view: 'GRID',
            coverSize: 1,
            seriesCollapsed: false,
            overlayBookType: true,
          },
          overrides: [],
        },
      },
    });
    fixture.detectChanges();

    flushFacetRegistry();
    http.expectOne(request =>
      request.url === PAGE_URL &&
      request.params.get('sort') === '-title' &&
      !request.params.has('cursor'),
    ).flush(bookPage([1], 1));
    await flushQueryAsync();
  });

  it('reselecting the active sort keeps the URL and issues no new request', async () => {
    await TestBed.inject(Router).navigate([], {queryParams: {sort: 'pageCount'}});
    fixture.detectChanges();
    flushFacetRegistry();

    http.expectOne(request =>
      request.url === PAGE_URL &&
      request.params.get('sort') === 'pageCount' &&
      !request.params.has('cursor'),
    ).flush(bookPage([1], 100));
    await flushQueryAsync();

    page().onSortChange({option: buildSortOptions(['pageCount'])[0], direction: 'asc'});
    await fixture.whenStable();
    await flushQueryAsync(1);

    http.expectNone(candidate => candidate.url === PAGE_URL);
    expect(grid().items().map(item => item?.id)).toEqual([1]);
  });

  it('flips only the primary term on direction toggle, keeping the multi-sort tail', async () => {
    await TestBed.inject(Router).navigate([], {queryParams: {sort: '-title,pageCount'}});
    fixture.detectChanges();
    flushFacetRegistry();

    http.expectOne(request =>
      request.url === PAGE_URL &&
      request.params.get('sort') === '-title,pageCount',
    ).flush(bookPage([1], 1));
    await flushQueryAsync();

    page().onSortDirectionChange({option: buildSortOptions(['title', '-title'])[0], direction: 'asc'});
    await fixture.whenStable();
    await flushQueryAsync(1);

    http.expectOne(request =>
      request.url === PAGE_URL &&
      request.params.get('sort') === 'title,pageCount',
    ).flush(bookPage([1], 1));
    await flushQueryAsync();
  });

  it('does not start a second next-page request while one is active', async () => {
    fixture.detectChanges();
    expectInitialPageRequest().flush(bookPage([1, 2], 600, [{
      rel: ['next'],
      href: '/api/v1/books/page?cursor=next&sort=title&size=60',
      type: 'application/json',
    }]));
    await flushQueryAsync();

    grid().visibleRange.emit({start: 1, end: 1});
    await flushQueryAsync(1);
    const nextRequest = http.expectOne(
      `${API_CONFIG.BASE_URL}/api/v1/books/page?cursor=next&sort=title&size=60`,
    );

    grid().visibleRange.emit({start: 1, end: 1});
    await flushQueryAsync(1);

    nextRequest.flush(bookPage([3], 600));
    await flushQueryAsync();
    expect(grid().items().map(item => item?.id)).toEqual([1, 2, 3]);
  });

  it('scopes page requests by the query URL param', async () => {
    await TestBed.inject(Router).navigate([], {queryParams: {query: 'warden'}});
    fixture.detectChanges();
    flushFacetRegistry();

    const request = http.expectOne(candidate =>
      candidate.url === PAGE_URL &&
      candidate.params.get('query') === 'warden' &&
      !candidate.params.has('page') &&
      !candidate.params.has('cursor'),
    );
    request.flush(bookPage([1], 1));
    await flushQueryAsync();

    expect(grid().items().map(item => item?.id)).toEqual([1]);
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
      queryParams: {facet: null},
      queryParamsHandling: 'merge',
    }));
  });

  it('debounces typed text into the query param as one replaceUrl navigation', () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      expectInitialPageRequest().flush(bookPage([1], 1));

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

    expect(metadataMenuItem('Lock/unlock metadata')).toBeUndefined();
  });

  it('shows only lock actions in Metadata for a lock-only user', async () => {
    currentUser.set({permissions: {canBulkLockUnlockMetadata: true}});
    await loadAndSelect([book(231)]);

    fitAllBulkVerbs();

    expect(bulkBarButton('Metadata')).toBeDefined();
    expect(bulkMetadataItemLabels()).toEqual([
      'Lock All',
      'Unlock All',
      'Lock/unlock metadata',
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

    metadataMenuItem('Lock/unlock metadata')?.click();

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
    expectInitialPageRequest().flush(bookPage([1], 1));
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
    flushFacetRegistry();
    expectInitialPageRequest().flush(bookPage([1], 1));
    await flushQueryAsync();
  });

  it('offers only the current user shelves in book assignment menus', async () => {
    currentUser.set({id: 7, permissions: {}});
    shelfDefinitions = [
      {id: 5, userId: 7, name: 'Mine', visibility: 'private', bookCount: 1, icon: null},
      {id: 6, userId: 9, name: 'Shared by someone else', visibility: 'public', bookCount: 1, icon: null},
    ];
    fixture.detectChanges();
    expectInitialPageRequest().flush(bookPage([1], 1));
    await flushQueryAsync();

    const component = fixture.componentInstance as unknown as {
      menuBookSnapshot: {set(value: BookSummary): void};
      menuShelves(): readonly {id: number}[];
      bulkShelves(): readonly {id: number}[];
    };
    component.menuBookSnapshot.set(book(1));

    expect(component.menuShelves().map(shelf => shelf.id)).toEqual([5]);
    expect(component.bulkShelves().map(shelf => shelf.id)).toEqual([5]);
  });
});
