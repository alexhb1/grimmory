import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../core/testing/transloco-testing';
import {UrlHelperService} from '../../../shared/service/url-helper.service';
import {type BookSummary} from '../data/book-response.models';
import {BookBrowseColumnWidthPreferenceService} from './book-browse-column-width-preference.service';
import {BookBrowseTableComponent} from './book-browse-table.component';

function book(id: number, title: string): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {bookId: id, title, authors: ['Author'], allMetadataLocked: false},
  };
}

describe('BookBrowseTableComponent', () => {
  let fixture: ComponentFixture<BookBrowseTableComponent>;
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  let component: BookBrowseTableComponent;
  let storedWidths: Record<string, number>;
  let saveWidths: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storedWidths = {};
    saveWidths = vi.fn();
    TestBed.configureTestingModule({
      imports: [BookBrowseTableComponent, getTranslocoModule()],
      providers: [
        provideRouter([]),
        {
          provide: UrlHelperService,
          useValue: {
            getThumbnailUrl: (id: number) => `/thumb/${id}`,
            getAudiobookThumbnailUrl: (id: number) => `/audio-thumb/${id}`,
          },
        },
        {
          provide: BookBrowseColumnWidthPreferenceService,
          useValue: {load: () => storedWidths, save: saveWidths},
        },
      ],
    });

    fixture = TestBed.createComponent(BookBrowseTableComponent);
    fixture.componentRef.setInput('books', []);
    fixture.componentRef.setInput('hasNextPage', false);
    fixture.componentRef.setInput('pendingDeletionIds', new Set());
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visibleColumns', [
      {field: 'title', header: 'Title'},
      {field: 'authors', header: 'Authors'},
    ]);
    fixture.componentRef.setInput('sorting', []);
    fixture.componentRef.setInput('sortableFields', new Set(['title']));
    fixture.componentRef.setInput('mobile', false);
    fixture.componentRef.setInput('selection', {
      mode: 'available', allSelected: false, someSelected: false, isSelected: () => false,
    });
    fixture.componentRef.setInput('openMenuBookId', null);
    fixture.componentRef.setInput('useSquareCovers', false);
    fixture.componentRef.setInput('nextPageError', false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('holds the first-load skeleton fill until the 180ms delay elapses', () => {
    vi.useFakeTimers();
    fixture.detectChanges();

    const rowCountAttr = (): string | null =>
      host().querySelector('table')?.getAttribute('aria-rowcount') ?? null;
    expect(rowCountAttr()).toBe('1');

    vi.advanceTimersByTime(179);
    fixture.detectChanges();
    expect(rowCountAttr()).toBe('1');

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(rowCountAttr()).toBe('13');
  });

  it('skips the skeleton fill when loaded books are present', () => {
    vi.useFakeTimers();
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.detectChanges();

    expect(host().querySelector('table')?.getAttribute('aria-rowcount')).toBe('2');
  });

  it('keeps both the row model and virtual geometry bounded to loaded books', () => {
    const books = [book(1, 'Alpha'), book(2, 'Beta')];
    fixture.componentRef.setInput('books', books);
    fixture.detectChanges();

    const table = Reflect.get(component, 'table') as {
      getRowModel(): {rows: {original: BookSummary}[]};
    };
    expect(table.getRowModel().rows.map(row => row.original.id)).toEqual([1, 2]);
    expect(host().querySelector('table')?.getAttribute('aria-rowcount')).toBe('3');
    expect(host().querySelector('[role="grid"]')).toBeNull();
  });

  it('gives TanStack Virtual stable book ids instead of loaded-window indexes', async () => {
    fixture.componentRef.setInput('books', [book(101, 'Alpha'), book(205, 'Beta')]);
    await fixture.whenStable();

    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {
      options(): {getItemKey(index: number): unknown};
    };
    expect(virtualizer.options().getItemKey(0)).toBe(101);
    expect(virtualizer.options().getItemKey(1)).toBe(205);
  });

  it('uses TanStack header sorting and emits controlled server sort state', () => {
    const changes: unknown[] = [];
    component.sortingChange.subscribe(change => changes.push(change));
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.detectChanges();

    host().querySelector<HTMLButtonElement>('.sort-button')!.click();

    expect(changes).toEqual([[{id: 'title', desc: false}]]);
  });

  it('reveals all selection controls during selection and only toggles from the checkbox', () => {
    const changes: unknown[] = [];
    component.selectionChange.subscribe(change => changes.push(change));
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('selection', {
      mode: 'active', allSelected: false, someSelected: false, isSelected: () => false,
    });
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    expect(host().querySelector('.book-browse-table-pane')?.classList).toContain('selection-active');
    host().querySelector<HTMLTableRowElement>('tbody tr')!.click();
    expect(changes).toEqual([]);
    host().querySelector<HTMLInputElement>('input[aria-label="Select Alpha"]')!.click();
    expect(changes).toEqual([expect.objectContaining({index: 0, checked: true, shiftKey: false})]);
  });

  it('emits a row menu request on desktop right-click and leaves mobile alone', () => {
    const requests: unknown[] = [];
    component.menuRequested.subscribe(request => requests.push(request));
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    const row = host().querySelector<HTMLTableRowElement>('tbody tr')!;
    const rightClick = new MouseEvent('contextmenu', {cancelable: true, bubbles: true});
    row.dispatchEvent(rightClick);
    expect(rightClick.defaultPrevented).toBe(true);
    expect(requests).toEqual([expect.objectContaining({book: expect.objectContaining({id: 1})})]);

    host().querySelector<HTMLButtonElement>('button[aria-label="Options for Alpha"]')!.click();
    expect(requests).toEqual([
      expect.objectContaining({book: expect.objectContaining({id: 1})}),
      expect.objectContaining({book: expect.objectContaining({id: 1})}),
    ]);

    fixture.componentRef.setInput('mobile', true);
    fixture.detectChanges();
    const mobilePress = new MouseEvent('contextmenu', {cancelable: true, bubbles: true});
    host().querySelector('tbody tr')!.dispatchEvent(mobilePress);
    expect(mobilePress.defaultPrevented).toBe(false);
    expect(requests).toHaveLength(2);
  });

  it('keeps a real detail href and emits requests only for plain left clicks', () => {
    const requests: BookSummary[] = [];
    component.detailRequested.subscribe(book => requests.push(book));
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    const link = host().querySelector<HTMLAnchorElement>('.book-link')!;
    expect(link.getAttribute('href')).toBe('/book/1');

    const modified = new MouseEvent('click', {bubbles: true, cancelable: true, ctrlKey: true});
    (component as unknown as {
      onDetailClick(book: BookSummary, event: MouseEvent): void;
    }).onDetailClick(book(1, 'Alpha'), modified);
    expect(modified.defaultPrevented).toBe(false);
    expect(requests).toEqual([]);

    link.click();
    expect(requests.map(book => book.id)).toEqual([1]);
  });

  it('marks the row whose menu is open', () => {
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('openMenuBookId', 1);
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    expect(host().querySelector('tbody tr')?.getAttribute('data-menu-open')).toBe('true');
  });

  it('mobile select mode turns the whole row into the selection toggle', () => {
    const changes: unknown[] = [];
    component.selectionChange.subscribe(change => changes.push(change));
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('mobile', true);
    fixture.componentRef.setInput('selection', {
      mode: 'active', allSelected: false, someSelected: false, isSelected: () => false,
    });
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    const overlay = host().querySelector<HTMLButtonElement>('.row-select-overlay')!;
    overlay.click();
    expect(changes).toEqual([expect.objectContaining({index: 0, checked: true, shiftKey: false})]);

    fixture.componentRef.setInput('selection', {
      mode: 'available', allSelected: false, someSelected: false, isSelected: () => false,
    });
    fixture.detectChanges();
    expect(host().querySelector('.row-select-overlay')).toBeNull();
  });

  it('seeds column widths from the device preference', () => {
    storedWidths = {title: 400};
    fixture = TestBed.createComponent(BookBrowseTableComponent);
    fixture.componentRef.setInput('visibleColumns', [{field: 'title', header: 'Title'}]);
    fixture.componentRef.setInput('sortableFields', new Set(['title']));
    fixture.componentRef.setInput('books', []);
    fixture.componentRef.setInput('hasNextPage', false);
    fixture.componentRef.setInput('pendingDeletionIds', new Set());
    fixture.componentRef.setInput('sorting', []);
    fixture.componentRef.setInput('mobile', false);
    fixture.componentRef.setInput('selection', {
      mode: 'available', allSelected: false, someSelected: false, isSelected: () => false,
    });
    fixture.componentRef.setInput('openMenuBookId', null);
    fixture.componentRef.setInput('useSquareCovers', false);
    fixture.componentRef.setInput('nextPageError', false);
    fixture.detectChanges();

    const table = Reflect.get(fixture.componentInstance, 'table') as {
      getColumn(id: string): {getSize(): number} | undefined;
    };
    expect(table.getColumn('title')?.getSize()).toBe(400);
    expect(saveWidths).not.toHaveBeenCalled();
  });

  it('persists column widths once sizing settles, not on mount', () => {
    fixture.detectChanges();
    expect(saveWidths).not.toHaveBeenCalled();

    const table = Reflect.get(component, 'table') as {
      setColumnSizing(state: Record<string, number>): void;
    };
    table.setColumnSizing({authors: 300});
    fixture.detectChanges();

    expect(saveWidths).toHaveBeenCalledExactlyOnceWith({authors: 300});
  });

  it('scrollToTop resets the vertical pane offset', () => {
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.detectChanges();

    const pane = host().querySelector('.book-browse-table-pane') as HTMLElement;
    pane.scrollTop = 500;
    component.scrollToTop();
    expect(pane.scrollTop).toBe(0);
  });

  it('shows a next-page retry action when a continuation fails', async () => {
    const retryNext = vi.fn();
    component.retryNextPage.subscribe(retryNext);
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('nextPageError', true);
    await fixture.whenStable();

    const retryButtons = Array.from(
      host().querySelectorAll<HTMLButtonElement>('.page-error button'),
    );
    expect(retryButtons).toHaveLength(1);

    retryButtons[0].click();
    expect(retryNext).toHaveBeenCalledOnce();
  });

  it('keeps the first linked value readable and exposes remaining values as linked menu items', () => {
    const selected: unknown[] = [];
    component.facetRequested.subscribe(value => selected.push(value));
    const genreBook: BookSummary = {
      ...book(1, 'Alpha'),
      metadata: {
        ...book(1, 'Alpha').metadata!,
        categories: ['Fantasy', 'Science Fiction', 'Adventure'],
      },
    };
    fixture.componentRef.setInput('visibleColumns', [
      {field: 'title', header: 'Title'},
      {field: 'categories', header: 'Genres'},
    ]);
    fixture.componentRef.setInput('books', [genreBook]);
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    const trigger = host().querySelector<HTMLButtonElement>('.cell-overflow-trigger')!;
    expect(host().querySelector('.cell-link-primary')?.textContent).toContain('Fantasy');
    expect(trigger.textContent.trim()).toBe('+2');
    expect(trigger.getAttribute('aria-label')).toBe('Show 2 more Genres');

    trigger.focus();
    trigger.click();
    fixture.detectChanges();

    const menu = document.querySelector('app-menu[aria-label="Show 2 more Genres"]') as HTMLElement;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('app-menu-item'));
    expect(items.map(item => item.textContent.trim())).toEqual(['Science Fiction', 'Adventure']);
    items[0].click();
    fixture.detectChanges();
    expect(selected).toEqual([{key: 'genre', value: 'Science Fiction'}]);
  });
});
