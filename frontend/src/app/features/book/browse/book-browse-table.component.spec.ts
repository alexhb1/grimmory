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
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visibleColumns', [
      {field: 'title', header: 'Title'},
      {field: 'authors', header: 'Authors'},
    ]);
    fixture.componentRef.setInput('sortableFields', new Set(['title']));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds the first-load skeleton fill until the 180ms delay elapses', () => {
    vi.useFakeTimers();
    fixture.detectChanges();

    const rowCountAttr = (): string | null =>
      fixture.nativeElement.querySelector('table')?.getAttribute('aria-rowcount') ?? null;
    expect(rowCountAttr()).toBe('1');

    vi.advanceTimersByTime(179);
    fixture.detectChanges();
    expect(rowCountAttr()).toBe('1');

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(rowCountAttr()).toBe('13');
  });

  it('skips the skeleton fill entirely when the count is already known', () => {
    vi.useFakeTimers();
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('loadedBooks', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('totalCount', 1);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('table')?.getAttribute('aria-rowcount')).toBe('2');
  });

  it('keeps the TanStack row model bounded to loaded books while Virtual owns sparse slots', () => {
    const books = new Array<BookSummary | undefined>(1_000);
    books[0] = book(1, 'Alpha');
    books[500] = book(2, 'Beta');
    fixture.componentRef.setInput('books', books);
    fixture.componentRef.setInput('loadedBooks', [books[0]!, books[500]!]);
    fixture.componentRef.setInput('totalCount', 1_000);
    fixture.detectChanges();

    const table = Reflect.get(component, 'table') as {
      getRowModel(): {rows: Array<{original: BookSummary}>};
    };
    expect(table.getRowModel().rows.map(row => row.original.id)).toEqual([1, 2]);
    expect(fixture.nativeElement.querySelector('table')?.getAttribute('aria-rowcount')).toBe('1001');
    expect(fixture.nativeElement.querySelector('[role="grid"]')).toBeNull();
  });

  it('uses TanStack header sorting and emits controlled server sort state', () => {
    const changes: unknown[] = [];
    component.sortingChange.subscribe(change => changes.push(change));
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('loadedBooks', [book(1, 'Alpha')]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.sort-button') as HTMLButtonElement).click();

    expect(changes).toEqual([[{id: 'title', desc: false}]]);
  });

  it('reveals all selection controls during selection and only toggles from the checkbox', () => {
    const changes: unknown[] = [];
    component.selectionChange.subscribe(change => changes.push(change));
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('loadedBooks', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('selectionMode', true);
    fixture.componentRef.setInput('isSelected', () => false);
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.book-browse-table-pane')?.classList).toContain('selection-active');
    (fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement).click();
    expect(changes).toEqual([]);
    (fixture.nativeElement.querySelector('input[aria-label="Select Alpha"]') as HTMLInputElement).click();
    expect(changes).toEqual([expect.objectContaining({index: 0, checked: true, shiftKey: false})]);
  });

  it('emits a row menu request on desktop right-click and leaves mobile alone', () => {
    const requests: unknown[] = [];
    component.menuRequested.subscribe(request => requests.push(request));
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('loadedBooks', [book(1, 'Alpha')]);
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;
    const rightClick = new MouseEvent('contextmenu', {cancelable: true, bubbles: true});
    row.dispatchEvent(rightClick);
    expect(rightClick.defaultPrevented).toBe(true);
    expect(requests).toEqual([expect.objectContaining({book: expect.objectContaining({id: 1})})]);

    fixture.componentRef.setInput('mobile', true);
    fixture.detectChanges();
    const mobilePress = new MouseEvent('contextmenu', {cancelable: true, bubbles: true});
    fixture.nativeElement.querySelector('tbody tr')!.dispatchEvent(mobilePress);
    expect(mobilePress.defaultPrevented).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('marks the row whose menu is open', () => {
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('loadedBooks', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('openMenuBookId', 1);
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('tbody tr')?.getAttribute('data-menu-open')).toBe('true');
  });

  it('mobile select mode turns the whole row into the selection toggle', () => {
    const changes: unknown[] = [];
    component.selectionChange.subscribe(change => changes.push(change));
    fixture.componentRef.setInput('books', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('loadedBooks', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('mobile', true);
    fixture.componentRef.setInput('selectionMode', true);
    fixture.componentRef.setInput('isSelected', () => false);
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.row-select-overlay') as HTMLButtonElement;
    overlay.click();
    expect(changes).toEqual([expect.objectContaining({index: 0, checked: true, shiftKey: false})]);

    fixture.componentRef.setInput('selectionMode', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.row-select-overlay')).toBeNull();
  });

  it('seeds column widths from the device preference', () => {
    storedWidths = {title: 400};
    fixture = TestBed.createComponent(BookBrowseTableComponent);
    fixture.componentRef.setInput('visibleColumns', [{field: 'title', header: 'Title'}]);
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
    fixture.componentRef.setInput('loadedBooks', [book(1, 'Alpha')]);
    fixture.componentRef.setInput('totalCount', 1);
    fixture.detectChanges();

    const pane = fixture.nativeElement.querySelector('.book-browse-table-pane') as HTMLElement;
    pane.scrollTop = 500;
    component.scrollToTop();
    expect(pane.scrollTop).toBe(0);
  });

  it('renders one positional retry row for a visible failed page', () => {
    const retry = vi.fn();
    component.retryRequested.subscribe(retry);
    fixture.componentRef.setInput('books', new Array(120));
    fixture.componentRef.setInput('totalCount', 120);
    fixture.componentRef.setInput('failedPages', new Set([1]));
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 70, key: 70, start: 3_780, size: 54, end: 3_834, lane: 0},
      {index: 71, key: 71, start: 3_834, size: 54, end: 3_888, lane: 0},
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.failure-cell')).toHaveLength(1);
    (fixture.nativeElement.querySelector('.failure-cell button') as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalledOnce();
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
    fixture.componentRef.setInput('loadedBooks', [genreBook]);
    const virtualizer = Reflect.get(component, 'rowVirtualizer') as {getVirtualItems(): unknown[]};
    vi.spyOn(virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 0, start: 0, size: 54, end: 54, lane: 0},
    ]);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.cell-overflow-trigger') as HTMLButtonElement;
    expect(fixture.nativeElement.querySelector('.cell-link-primary')?.textContent).toContain('Fantasy');
    expect(trigger.textContent?.trim()).toBe('+2');
    expect(trigger.getAttribute('aria-label')).toBe('Show 2 more Genres');

    trigger.focus();
    trigger.click();
    fixture.detectChanges();

    const menu = document.querySelector('app-menu[aria-label="Show 2 more Genres"]') as HTMLElement;
    const items = Array.from(menu.querySelectorAll('app-menu-item')) as HTMLElement[];
    expect(items.map(item => item.textContent?.trim())).toEqual(['Science Fiction', 'Adventure']);
    items[0].click();
    fixture.detectChanges();
    expect(selected).toEqual([{key: 'genre', value: 'Science Fiction'}]);
  });
});
