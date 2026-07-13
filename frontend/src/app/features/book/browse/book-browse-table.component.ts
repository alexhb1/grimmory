import {DatePipe} from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {
  type ColumnDef,
  type ColumnPinningState,
  type ColumnSizingState,
  type Cell,
  type Header,
  type Row,
  type SortingState,
  createAngularTable,
  functionalUpdate,
  getCoreRowModel,
} from '@tanstack/angular-table';
import {injectVirtualizer} from '@tanstack/angular-virtual';

import {CoverComponent} from '../../../shared/components/cover/cover.component';
import {UrlHelperService} from '../../../shared/service/url-helper.service';
import {RouteScrollPositionService} from '../../../shared/service/route-scroll-position.service';
import {AppCheckboxComponent} from '../../../shared/ui/checkbox/app-checkbox.component';
import {AppButtonComponent} from '../../../shared/ui/button/app-button.component';
import {AppMenuComponent} from '../../../shared/ui/menu/app-menu.component';
import {AppMenuItemComponent} from '../../../shared/ui/menu/app-menu-item.component';
import {AppMenuTriggerForDirective} from '../../../shared/ui/menu/app-menu-trigger.directive';
import {cn} from '../../../shared/ui/cn';
import {SKELETON_DELAY_MS} from '../../../shared/components/browse/browse-grid/browse-grid.util';
import {type BookSummary} from '../data/book-response.models';
import {BookBrowseColumnWidthPreferenceService} from './book-browse-column-width-preference.service';
import {type BrowseVisibleRange} from './book-browse.models';

export interface BookBrowseTableColumn {
  field: string;
  header: string;
}

export interface BookBrowseTableSelectionChange {
  book: BookSummary;
  index: number;
  checked: boolean;
  shiftKey: boolean;
}

export interface BookBrowseTableFacetRequest {
  key: string;
  value: string;
}

export interface BookBrowseTableMenuRequest {
  book: BookSummary;
  event: MouseEvent;
}

const ROW_HEIGHT = 54;
const RENDER_OVERSCAN = 10;
const SELECT_COLUMN_WIDTH = 44;
const NUMERIC_FIELDS = new Set([
  'seriesNumber',
  'pageCount',
  'fileSizeKb',
  'amazonRating',
  'amazonReviewCount',
  'goodreadsRating',
  'goodreadsReviewCount',
  'hardcoverRating',
  'hardcoverReviewCount',
  'ranobedbRating',
]);
const RATING_FIELDS = new Set([
  'amazonRating',
  'goodreadsRating',
  'hardcoverRating',
  'ranobedbRating',
]);
const DEFAULT_COLUMN_WIDTHS: Readonly<Record<string, number>> = {
  title: 320,
  authors: 220,
  publisher: 180,
  seriesName: 190,
  seriesNumber: 96,
  categories: 220,
  publishedDate: 132,
  lastReadTime: 132,
  addedOn: 132,
  fileName: 240,
  fileSizeKb: 112,
  language: 112,
  isbn: 150,
  pageCount: 104,
  readStatus: 132,
};

const HEADER_CELL_CLASS =
  'relative box-border h-[42px] min-w-0 flex-none overflow-hidden bg-page px-3 text-left ' +
  'text-xs font-semibold leading-[42px] whitespace-nowrap text-text-secondary';

const BODY_CELL_CLASS =
  'box-border flex h-[54px] min-w-0 flex-none items-center overflow-hidden border-b ' +
  'border-border/70 bg-page px-3 ' +
  'group-hover/row:bg-[color-mix(in_srgb,var(--color-text)_8%,var(--color-page))] ' +
  'group-data-[menu-open=true]/row:bg-[color-mix(in_srgb,var(--color-text)_8%,var(--color-page))] ' +
  'group-data-[selected=true]/row:!bg-[color-mix(in_srgb,var(--color-primary)_7%,var(--color-page))]';

@Component({
  selector: 'app-book-browse-table',
  standalone: true,
  imports: [
    AppButtonComponent,
    AppCheckboxComponent,
    AppMenuComponent,
    AppMenuItemComponent,
    AppMenuTriggerForDirective,
    CoverComponent,
    RouterLink,
    TranslocoPipe,
  ],
  providers: [DatePipe],
  templateUrl: './book-browse-table.component.html',
  host: {
    class: 'block max-h-full min-h-0 min-w-0 w-full',
    '[class.flex-1]': 'mobile()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookBrowseTableComponent {
  readonly books = input<readonly (BookSummary | undefined)[]>([]);
  readonly loadedBooks = input<BookSummary[]>([]);
  readonly pendingDeletionIds = input<ReadonlySet<number>>(new Set());
  readonly totalCount = input<number | null>(null);
  readonly visibleColumns = input<readonly BookBrowseTableColumn[]>([]);
  readonly sorting = input<SortingState>([]);
  readonly sortableFields = input<ReadonlySet<string>>(new Set());
  readonly mobile = input(false);
  readonly selectionEnabled = input(true);
  readonly selectionMode = input(false);
  readonly allSelected = input(false);
  readonly someSelected = input(false);
  readonly isSelected = input<(book: BookSummary, index: number) => boolean>(() => false);
  readonly openMenuBookId = input<number | null>(null);
  readonly useSquareCovers = input(false);
  readonly skeletonCount = input(12);
  readonly failedPages = input<ReadonlySet<number>>(new Set());
  readonly pageSize = input(60);

  readonly visibleRange = output<BrowseVisibleRange>();
  readonly sortingChange = output<SortingState>();
  readonly selectionChange = output<BookBrowseTableSelectionChange>();
  readonly selectAllRequested = output<void>();
  readonly clearSelectionRequested = output<void>();
  readonly facetRequested = output<BookBrowseTableFacetRequest>();
  readonly menuRequested = output<BookBrowseTableMenuRequest>();
  readonly retryRequested = output<void>();

  private readonly datePipe = inject(DatePipe);
  private readonly transloco = inject(TranslocoService);
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  private readonly urlHelper = inject(UrlHelperService);
  private readonly route = inject(ActivatedRoute);
  private readonly scrollPosition = inject(RouteScrollPositionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollElement = viewChild<ElementRef<HTMLElement>>('scrollElement');
  private readonly initialScrollOffset = () =>
    this.scrollPosition.getPosition(this.scrollPosition.keyFor(this.route, 'table')) ?? 0;
  private readonly initialHorizontalScrollOffset =
    this.scrollPosition.getPosition(this.scrollPosition.keyFor(this.route, 'table-x')) ?? 0;
  private readonly columnWidthPreference = inject(BookBrowseColumnWidthPreferenceService);
  private readonly columnSizing = signal<ColumnSizingState>(this.columnWidthPreference.load());
  private lastPersistedWidths = this.columnSizing();
  private readonly columnPinning = computed<ColumnPinningState>(() => ({
    left: [
      ...(this.selectionEnabled() ? ['select'] : []),
      ...(!this.mobile() ? ['title'] : []),
    ],
    right: [],
  }));
  private readonly hasHorizontalOverlap = signal(false);
  protected readonly overflowLinks = signal<readonly BookBrowseTableFacetRequest[]>([]);
  protected readonly overflowMenuLabel = signal('');
  private selectionShiftKey = false;
  private horizontalScrollRestored = false;
  private lastVisibleRange: BrowseVisibleRange | null = null;

  protected readonly selectionActive = computed(() =>
    this.selectionMode() || this.someSelected() || this.allSelected(),
  );

  protected readonly paneClass = computed(() => cn(
    'book-browse-table-pane relative box-border max-h-full overflow-auto overscroll-contain ' +
      'bg-page pb-[env(safe-area-inset-bottom)]',
    this.mobile()
      ? '-mx-4 h-full w-[calc(100%+2rem)]'
      : 'rounded-xl border border-border',
  ));

  protected readonly renderedColumns = computed<readonly BookBrowseTableColumn[]>(() => {
    this.activeLang();
    const requested = this.visibleColumns();
    const title = requested.find(column => column.field === 'title') ?? {
      field: 'title',
      header: this.transloco.translate('browse.table.columns.title'),
    };
    return [title, ...requested.filter(column => column.field !== 'title')];
  });

  private readonly columnDefs = computed<ColumnDef<BookSummary>[]>(() => {
    this.activeLang();
    return [
    ...(this.selectionEnabled()
      ? [{
          id: 'select',
          header: '',
          size: SELECT_COLUMN_WIDTH,
          minSize: SELECT_COLUMN_WIDTH,
          maxSize: SELECT_COLUMN_WIDTH,
          enableResizing: false,
          enableSorting: false,
          accessorFn: () => undefined,
        } satisfies ColumnDef<BookSummary>]
      : []),
    ...this.renderedColumns().map(column => ({
      id: column.field,
      header: column.header,
      size: this.defaultColumnWidth(column.field),
      minSize: column.field === 'title' ? 220 : 84,
      maxSize: column.field === 'title' ? 520 : 420,
      enableSorting: this.sortableFields().has(column.field),
      sortDescFirst: this.sortDescFirst(column.field),
      accessorFn: book => this.accessorValue(book, column.field),
    } satisfies ColumnDef<BookSummary>)),
    ];
  });

  protected readonly table = createAngularTable(() => ({
    data: this.loadedBooks(),
    columns: this.columnDefs(),
    getCoreRowModel: getCoreRowModel(),
    getRowId: book => String(book.id),
    manualSorting: true,
    enableSortingRemoval: false,
    columnResizeMode: 'onChange',
    state: {
      sorting: this.sorting(),
      columnSizing: this.columnSizing(),
      columnPinning: this.columnPinning(),
    },
    onSortingChange: updater => {
      this.sortingChange.emit(functionalUpdate(updater, this.sorting()));
    },
    onColumnSizingChange: updater => {
      this.columnSizing.update(current => functionalUpdate(updater, current));
    },
  }));

  protected readonly headers = computed(() => this.table.getFlatHeaders());
  protected readonly rowsByBookId = computed<ReadonlyMap<number, Row<BookSummary>>>(() =>
    new Map(this.table.getRowModel().rows.map(row => [row.original.id, row])),
  );
  private readonly skeletonDelayElapsed = signal(false);
  protected readonly rowCount = computed(() => {
    const knownCount = this.totalCount();
    if (knownCount != null) {
      return knownCount;
    }
    if (!this.skeletonDelayElapsed()) {
      return this.books().length;
    }
    return Math.max(this.books().length, this.skeletonCount());
  });
  protected readonly ariaRowCount = computed(() => this.rowCount() + 1);
  protected readonly ariaColumnCount = computed(() => this.headers().length);
  protected readonly tableWidth = computed(() => {
    this.columnSizing();
    this.columnDefs();
    return this.table.getTotalSize();
  });
  protected readonly isColumnResizing = computed(() => {
    this.columnSizing();
    return Boolean(this.table.getState().columnSizingInfo.isResizingColumn);
  });
  protected readonly columnSizeVars = computed<Record<string, string>>(() => {
    this.columnSizing();
    this.columnDefs();

    return this.table.getVisibleFlatColumns().reduce<Record<string, string>>((styles, column) => {
      styles[`--book-browse-col-${column.id}-size`] = `${column.getSize()}px`;
      if (column.getIsPinned() === 'left') {
        styles[`--book-browse-col-${column.id}-left`] = `${column.getStart('left')}px`;
      }
      return styles;
    }, {});
  });

  protected readonly rowVirtualizer = injectVirtualizer<HTMLElement, HTMLTableRowElement>(() => ({
    scrollElement: this.scrollElement(),
    count: this.rowCount(),
    estimateSize: () => ROW_HEIGHT,
    overscan: this.isColumnResizing() ? 2 : RENDER_OVERSCAN,
    getItemKey: index => index,
    initialOffset: this.initialScrollOffset,
  }));
  protected readonly failureRowIndexes = computed<ReadonlySet<number>>(() => {
    const failedPages = this.failedPages();
    const pageSize = this.pageSize();
    const representatives = new Set<number>();
    const representedPages = new Set<number>();
    if (pageSize < 1) return representatives;

    for (const row of this.rowVirtualizer.getVirtualItems()) {
      const page = Math.floor(row.index / pageSize);
      if (failedPages.has(page) && !representedPages.has(page)) {
        representedPages.add(page);
        representatives.add(row.index);
      }
    }
    return representatives;
  });

  constructor() {
    effect(onCleanup => {
      const pendingEmpty = this.totalCount() == null && this.books().length === 0;
      if (!pendingEmpty) {
        this.skeletonDelayElapsed.set(false);
        return;
      }
      const timer = setTimeout(() => this.skeletonDelayElapsed.set(true), SKELETON_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });

    effect(() => {
      const widths = this.columnSizing();
      if (this.isColumnResizing() || widths === this.lastPersistedWidths) {
        return;
      }
      this.lastPersistedWidths = widths;
      this.columnWidthPreference.save(widths);
    });

    this.scrollPosition.trackRoute({
      scrollElement: this.scrollElement,
      route: this.route,
      destroyRef: this.destroyRef,
      keySuffix: 'table',
      dismissOverlaysBeforeSave: true,
      beforeSave: () => {
        const element = this.scrollElement()?.nativeElement;
        if (element) {
          this.scrollPosition.savePosition(
            this.scrollPosition.keyFor(this.route, 'table-x'),
            element.scrollLeft,
          );
        }
      },
    });

    afterRenderEffect({
      write: () => {
        const element = this.scrollElement()?.nativeElement;
        if (!element || this.horizontalScrollRestored) {
          return;
        }
        element.scrollLeft = this.initialHorizontalScrollOffset;
        this.hasHorizontalOverlap.set(this.initialHorizontalScrollOffset > 0);
        this.horizontalScrollRestored = true;
      },
    });

    effect(() => {
      const renderedRows = this.rowVirtualizer.getVirtualItems();
      if (renderedRows.length === 0) {
        return;
      }

      const range = {
        start: renderedRows[0].index,
        end: renderedRows[renderedRows.length - 1].index,
      };
      if (this.lastVisibleRange?.start === range.start && this.lastVisibleRange.end === range.end) {
        return;
      }
      this.lastVisibleRange = range;
      this.visibleRange.emit(range);
    });
  }

  protected columnWidth(field: string): string {
    return `var(--book-browse-col-${field}-size)`;
  }

  protected pinnedOffset(field: string): string | null {
    const column = this.table.getColumn(field);
    return column?.getIsPinned() === 'left' ? `var(--book-browse-col-${field}-left)` : null;
  }

  protected isPinned(field: string): boolean {
    return this.table.getColumn(field)?.getIsPinned() === 'left';
  }

  protected isLastLeftPinned(field: string): boolean {
    const column = this.table.getColumn(field);
    return column?.getIsPinned() === 'left' && column.getIsLastColumn('left');
  }

  protected headerCellClass(field: string): string {
    return cn(
      HEADER_CELL_CLASS,
      this.isPinned(field) && 'sticky z-[5]',
      this.isLastLeftPinned(field) && this.hasHorizontalOverlap() && 'border-r border-border/70',
      this.isNumeric(field) && 'text-right tabular-nums',
    );
  }

  protected bodyCellClass(field: string, empty = false): string {
    return cn(
      BODY_CELL_CLASS,
      this.isPinned(field) && 'sticky z-[2]',
      this.isLastLeftPinned(field) && this.hasHorizontalOverlap() && 'border-r border-border/70',
      this.isNumeric(field) && 'justify-end text-right tabular-nums',
      empty && 'text-text-secondary',
    );
  }

  protected handleScroll(event: Event): void {
    this.hasHorizontalOverlap.set((event.currentTarget as HTMLElement).scrollLeft > 0);
  }

  protected isNumeric(field: string): boolean {
    return NUMERIC_FIELDS.has(field);
  }

  protected primaryAriaSort(header: Header<BookSummary, unknown>): 'ascending' | 'descending' | null {
    if (header.column.getSortIndex() !== 0) {
      return null;
    }
    const sorted = header.column.getIsSorted();
    if (!sorted) {
      return null;
    }
    return sorted === 'asc' ? 'ascending' : 'descending';
  }

  protected toggleSort(header: Header<BookSummary, unknown>, event: MouseEvent): void {
    header.column.getToggleSortingHandler()?.(event);
  }

  protected startResize(header: Header<BookSummary, unknown>, event: MouseEvent | TouchEvent): void {
    event.stopPropagation();
    header.getResizeHandler()(event);
  }

  protected resetWidth(header: Header<BookSummary, unknown>, event: MouseEvent): void {
    event.stopPropagation();
    header.column.resetSize();
  }

  protected rememberSelectionPointer(event: MouseEvent): void {
    event.stopPropagation();
    this.selectionShiftKey = event.shiftKey;
  }

  protected changeHeaderSelection(checked: boolean): void {
    if (checked) {
      this.selectAllRequested.emit();
    } else {
      this.clearSelectionRequested.emit();
    }
  }

  protected changeRowSelection(book: BookSummary, index: number, checked: boolean): void {
    this.selectionChange.emit({book, index, checked, shiftKey: this.selectionShiftKey});
    this.selectionShiftKey = false;
  }

  protected toggleRowSelection(book: BookSummary, index: number): void {
    this.changeRowSelection(book, index, !this.isSelected()(book, index));
  }

  protected onRowContextMenu(book: BookSummary | undefined, event: MouseEvent): void {
    if (!book || this.mobile()) {
      return;
    }
    event.preventDefault();
    this.menuRequested.emit({book, event});
  }

  scrollToTop(): void {
    const element = this.scrollElement()?.nativeElement;
    if (element) {
      element.scrollTop = 0;
    }
    this.rowVirtualizer.scrollToOffset(0);
  }

  protected title(book: BookSummary): string {
    return book.metadata?.title || book.primaryFile?.fileName || '';
  }

  protected authors(book: BookSummary): string[] {
    return book.metadata?.authors ?? [];
  }

  protected coverUrl(book: BookSummary): string | null {
    const metadata = book.metadata;
    return this.squareCover(book)
      ? this.urlHelper.getAudiobookThumbnailUrl(book.id, metadata?.audiobookCoverUpdatedOn)
      : this.urlHelper.getThumbnailUrl(book.id, metadata?.coverUpdatedOn);
  }

  protected squareCover(book: BookSummary): boolean {
    return this.useSquareCovers() || book.primaryFile?.bookType === 'AUDIOBOOK';
  }

  protected cellValue(cell: Cell<BookSummary, unknown>): string {
    const field = cell.column.id;
    const value = cell.getValue();
    if (value == null || value === '') {
      return '—';
    }
    if (['publishedDate', 'lastReadTime', 'addedOn'].includes(field)) {
      return this.dateValue(String(value)) || '—';
    }
    if (field === 'fileSizeKb') {
      return this.fileSize(Number(value)) || '—';
    }
    if (RATING_FIELDS.has(field)) {
      return this.ratingValue(Number(value)) || '—';
    }
    if (NUMERIC_FIELDS.has(field)) {
      return this.numberValue(Number(value)) || '—';
    }
    return String(value);
  }

  protected cellLinks(book: BookSummary, field: string): readonly BookBrowseTableFacetRequest[] {
    const metadata = book.metadata;
    switch (field) {
      case 'authors':
        return (metadata?.authors ?? []).map(value => ({key: 'author', value}));
      case 'seriesName':
        return metadata?.seriesName ? [{key: 'series', value: metadata.seriesName}] : [];
      case 'categories':
        return (metadata?.categories ?? []).map(value => ({key: 'genre', value}));
      case 'publisher':
        return metadata?.publisher ? [{key: 'publisher', value: metadata.publisher}] : [];
      case 'language':
        return metadata?.language ? [{key: 'language', value: metadata.language}] : [];
      default:
        return [];
    }
  }

  protected prepareOverflowMenu(
    links: readonly BookBrowseTableFacetRequest[],
    field: string,
  ): void {
    this.overflowLinks.set(links.slice(1));
    this.overflowMenuLabel.set(this.moreLinksLabel(field, links.length - 1));
  }

  protected moreLinksLabel(field: string, count: number): string {
    const column = this.renderedColumns().find(candidate => candidate.field === field)?.header ?? field;
    return this.transloco.translate('browse.table.moreValues', {count, column});
  }

  private accessorValue(book: BookSummary, field: string): string | number | undefined {
    const metadata = book.metadata;
    switch (field) {
      case 'title':
        return this.title(book);
      case 'authors':
        return metadata?.authors?.join(', ') ?? '';
      case 'publisher':
        return metadata?.publisher ?? '';
      case 'seriesName':
        return metadata?.seriesName ?? '';
      case 'seriesNumber':
        return metadata?.seriesNumber;
      case 'categories':
        return metadata?.categories?.join(', ') ?? '';
      case 'publishedDate':
        return metadata?.publishedDate;
      case 'lastReadTime':
        return book.lastReadTime;
      case 'addedOn':
        return book.addedOn;
      case 'fileName':
        return book.primaryFile?.fileName ?? '';
      case 'fileSizeKb':
        return book.primaryFile?.fileSizeKb;
      case 'language':
        return metadata?.language ?? '';
      case 'isbn':
        return metadata?.isbn13 ?? metadata?.isbn10 ?? '';
      case 'pageCount':
        return metadata?.pageCount;
      case 'readStatus':
        return this.readStatus(book.readStatus);
      case 'amazonReviewCount':
      case 'goodreadsReviewCount':
      case 'hardcoverReviewCount':
        return metadata?.[field];
      case 'amazonRating':
      case 'goodreadsRating':
      case 'hardcoverRating':
      case 'ranobedbRating':
        return metadata?.[field];
      default:
        return undefined;
    }
  }

  private defaultColumnWidth(field: string): number {
    if (DEFAULT_COLUMN_WIDTHS[field] != null) {
      return DEFAULT_COLUMN_WIDTHS[field];
    }
    if (RATING_FIELDS.has(field)) {
      return 124;
    }
    if (field.endsWith('ReviewCount')) {
      return 132;
    }
    return 176;
  }

  private sortDescFirst(field: string): boolean {
    return NUMERIC_FIELDS.has(field) || ['publishedDate', 'lastReadTime', 'addedOn'].includes(field);
  }

  private dateValue(value: string | undefined): string {
    return value ? this.datePipe.transform(value, 'mediumDate') ?? '' : '';
  }

  private numberValue(value: number | undefined): string {
    return value == null ? '' : new Intl.NumberFormat().format(value);
  }

  private ratingValue(value: number | undefined): string {
    return value == null ? '' : value.toFixed(1);
  }

  private fileSize(kilobytes: number | undefined): string {
    if (kilobytes == null) {
      return '';
    }
    if (kilobytes < 1024) {
      return `${Math.round(kilobytes)} KB`;
    }
    if (kilobytes < 1024 * 1024) {
      return `${(kilobytes / 1024).toFixed(1)} MB`;
    }
    return `${(kilobytes / (1024 * 1024)).toFixed(1)} GB`;
  }

  private readStatus(status: BookSummary['readStatus']): string {
    if (!status || status === 'UNSET') {
      return '';
    }
    const keys: Partial<Record<NonNullable<BookSummary['readStatus']>, string>> = {
      UNREAD: 'unread',
      READING: 'reading',
      RE_READING: 'reReading',
      READ: 'read',
      PARTIALLY_READ: 'partiallyRead',
      PAUSED: 'paused',
      WONT_READ: 'wontRead',
      ABANDONED: 'abandoned',
    };
    const key = keys[status];
    return key ? this.transloco.translate(`browse.table.readStatuses.${key}`) : '';
  }
}
