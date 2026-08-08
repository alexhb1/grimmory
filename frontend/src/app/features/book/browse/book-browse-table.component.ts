import {DatePipe, LocationStrategy} from '@angular/common';
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
import {ActivatedRoute, Router} from '@angular/router';
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
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  functionalUpdate,
  injectTable,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/angular-table';
import {injectVirtualizer} from '@tanstack/angular-virtual';
import {LucideEllipsisVertical} from '@lucide/angular';

import {CoverComponent} from '../../../shared/components/cover/cover.component';
import {UrlHelperService} from '../../../shared/service/url-helper.service';
import {contextMenuRequest, type ContextMenuRequest} from '../../../shared/ui/menu/app-menu.component';
import {isPlainLeftClick} from '../../../shared/util/pointer-gestures';
import {RouteScrollPositionService} from '../../../shared/service/route-scroll-position.service';
import {AppButtonComponent} from '../../../shared/ui/button/app-button.component';
import {AppCheckboxComponent} from '../../../shared/ui/checkbox/app-checkbox.component';
import {AppMenuComponent} from '../../../shared/ui/menu/app-menu.component';
import {AppMenuItemComponent} from '../../../shared/ui/menu/app-menu-item.component';
import {AppMenuTriggerDirective} from '../../../shared/ui/menu/app-menu-trigger.directive';
import {AppTagComponent} from '../../../shared/ui/tag/app-tag.component';
import {cn} from '../../../shared/ui/cn';
import {SKELETON_DELAY_MS} from '../../../shared/components/browse/browse-grid/browse-grid.util';
import {type BookQueryFacetKey} from '../data/book-query-params';
import {type BookSummary} from '../data/book-response.models';
import {
  type BookBrowseColumnKey,
  type BookBrowseColumnValue,
  bookBrowseColumnDefaultWidth,
  bookBrowseColumnKind,
  bookBrowseColumnSortDescFirst,
  bookBrowseColumnValue,
  bookBrowseFacetLinks,
  bookReadStatusLabelKey,
} from './book-browse-fields';
import {BookBrowseColumnWidthPreferenceService} from './book-browse-column-width-preference.service';
import {type BrowseGridRenderedRange} from '../../../shared/components/browse/browse-grid/browse-grid-viewport.component';

export interface BookBrowseTableColumn {
  field: BookBrowseColumnKey;
  header: string;
}

export interface BookBrowseTableSelectionChange {
  book: BookSummary;
  index: number;
  checked: boolean;
  shiftKey: boolean;
}

export interface BookBrowseTableFacetRequest {
  key: BookQueryFacetKey;
  value: string;
}

export interface BookBrowseTableMenuRequest {
  book: BookSummary;
  request: ContextMenuRequest;
}

export type BookBrowseTableSelection =
  | {mode: 'none'}
  | {
      mode: 'available' | 'active';
      allSelected: boolean;
      someSelected: boolean;
      isSelected: (book: BookSummary) => boolean;
    };

const ROW_HEIGHT = 54;
const RENDER_OVERSCAN = 10;
const SELECT_COLUMN_WIDTH = 44;
const MENU_COLUMN_WIDTH = 44;

const features = tableFeatures({
  rowSortingFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnPinningFeature,
});

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
    AppMenuTriggerDirective,
    AppTagComponent,
    CoverComponent,
    TranslocoPipe,
    LucideEllipsisVertical,
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
  readonly books = input.required<readonly BookSummary[]>();
  readonly hasNextPage = input.required<boolean>();
  readonly pendingDeletionIds = input.required<ReadonlySet<number>>();
  readonly visibleColumns = input.required<readonly BookBrowseTableColumn[]>();
  readonly sorting = input.required<SortingState>();
  readonly sortableFields = input.required<ReadonlySet<string>>();
  readonly mobile = input.required<boolean>();
  readonly selection = input.required<BookBrowseTableSelection>();
  readonly openMenuBookId = input.required<number | null>();
  readonly useSquareCovers = input.required<boolean>();
  readonly skeletonCount = input(12);
  readonly nextPageError = input.required<boolean>();

  readonly renderedRange = output<BrowseGridRenderedRange>();
  readonly sortingChange = output<SortingState>();
  readonly selectionChange = output<BookBrowseTableSelectionChange>();
  readonly selectAllRequested = output();
  readonly clearSelectionRequested = output();
  readonly facetRequested = output<BookBrowseTableFacetRequest>();
  readonly menuRequested = output<BookBrowseTableMenuRequest>();
  readonly detailRequested = output<BookSummary>();
  readonly retryNextPage = output();

  private readonly datePipe = inject(DatePipe);
  private readonly transloco = inject(TranslocoService);
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  private readonly urlHelper = inject(UrlHelperService);
  private readonly router = inject(Router);
  private readonly locationStrategy = inject(LocationStrategy);
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
    start: [
      ...(this.selection().mode !== 'none' ? ['select'] : []),
      ...(!this.mobile() ? ['title'] : []),
    ],
    end: [],
  }));
  private readonly hasHorizontalOverlap = signal(false);
  protected readonly overflowLinks = signal<readonly BookBrowseTableFacetRequest[]>([]);
  protected readonly overflowMenuLabel = signal('');
  private selectionShiftKey = false;
  private horizontalScrollRestored = false;
  private verticalScrollRestored = false;
  private lastRenderedRange: BrowseGridRenderedRange | null = null;

  protected readonly selectionActive = computed(() => this.selection().mode === 'active');
  protected readonly allSelected = computed(() => {
    const selection = this.selection();
    return selection.mode !== 'none' && selection.allSelected;
  });
  protected readonly someSelected = computed(() => {
    const selection = this.selection();
    return selection.mode !== 'none' && selection.someSelected;
  });

  protected readonly paneClass = computed(() => cn(
    'book-browse-table-pane relative box-border max-h-full overflow-auto overscroll-contain ' +
      'bg-page pb-[env(safe-area-inset-bottom)]',
    this.mobile()
      ? '-mx-4 h-full w-[calc(100%+2rem)]'
      : 'rounded-xl border border-border',
  ));

  protected readonly renderedColumns = computed<readonly BookBrowseTableColumn[]>(() => {
    const requested = this.visibleColumns();
    return [
      ...requested.filter(column => column.field === 'title'),
      ...requested.filter(column => column.field !== 'title'),
    ];
  });

  private readonly columnDefs = computed<ColumnDef<typeof features, BookSummary>[]>(() => {
    this.activeLang();
    return [
    ...(this.selection().mode !== 'none'
      ? [{
          id: 'select',
          header: '',
          size: SELECT_COLUMN_WIDTH,
          minSize: SELECT_COLUMN_WIDTH,
          maxSize: SELECT_COLUMN_WIDTH,
          enableResizing: false,
          enableSorting: false,
          accessorFn: () => undefined,
        } satisfies ColumnDef<typeof features, BookSummary, BookBrowseColumnValue>]
      : []),
    ...this.renderedColumns().map(column => ({
      id: column.field,
      header: column.header,
      size: bookBrowseColumnDefaultWidth(column.field),
      minSize: column.field === 'title' ? 220 : 84,
      maxSize: column.field === 'title' ? 520 : 420,
      enableSorting: this.sortableFields().has(column.field),
      sortDescFirst: this.sortDescFirst(column.field),
      accessorFn: book => bookBrowseColumnValue(book, column.field),
    } satisfies ColumnDef<typeof features, BookSummary, BookBrowseColumnValue>)),
    {
      id: 'menu',
      header: '',
      size: MENU_COLUMN_WIDTH,
      minSize: MENU_COLUMN_WIDTH,
      maxSize: MENU_COLUMN_WIDTH,
      enableResizing: false,
      enableSorting: false,
      accessorFn: () => undefined,
    } satisfies ColumnDef<typeof features, BookSummary, BookBrowseColumnValue>,
    ];
  });

  protected readonly table = injectTable(() => ({
    features,
    data: this.books(),
    columns: this.columnDefs(),
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
  protected readonly rowsByBookId = computed<ReadonlyMap<number, Row<typeof features, BookSummary>>>(
    () => new Map(this.table.getRowModel().rows.map(row => [row.original.id, row])),
  );
  private readonly skeletonDelayElapsed = signal(false);
  protected readonly rowCount = computed(() => {
    if (this.books().length > 0) {
      return this.books().length + (this.hasNextPage() ? 1 : 0);
    }
    if (!this.skeletonDelayElapsed()) {
      return 0;
    }
    return this.skeletonCount();
  });
  protected readonly ariaRowCount = computed(() => this.rowCount() + 1);
  protected readonly ariaColumnCount = computed(() => this.headers().length);
  protected readonly tableWidth = computed(() => this.table.getTotalSize());
  protected readonly isColumnResizing = computed(() =>
    Boolean(this.table.atoms.columnResizing.get().isResizingColumn),
  );
  protected readonly columnSizeVars = computed<Record<string, string>>(() =>
    this.table.getAllLeafColumns().reduce<Record<string, string>>((styles, column) => {
      styles[`--book-browse-col-${column.id}-size`] = `${column.getSize()}px`;
      if (column.getIsPinned() === 'start') {
        styles[`--book-browse-col-${column.id}-left`] = `${column.getStart('start')}px`;
      }
      return styles;
    }, {}),
  );

  protected readonly rowVirtualizer = injectVirtualizer<HTMLElement, HTMLTableRowElement>(() => ({
    scrollElement: this.scrollElement(),
    count: this.rowCount(),
    estimateSize: () => ROW_HEIGHT,
    overscan: this.isColumnResizing() ? 2 : RENDER_OVERSCAN,
    getItemKey: index => this.books()[index]?.id ?? `skeleton-${index}`,
    initialOffset: this.initialScrollOffset,
  }));

  constructor() {
    let hadBooks = false;
    effect(onCleanup => {
      if (this.books().length > 0) {
        hadBooks = true;
        this.skeletonDelayElapsed.set(false);
        return;
      }
      if (hadBooks) {
        this.skeletonDelayElapsed.set(true);
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
      if (this.verticalScrollRestored || this.books().length === 0) {
        return;
      }
      this.verticalScrollRestored = true;
      const offset = this.initialScrollOffset();
      if (offset > 0) {
        queueMicrotask(() => {
          requestAnimationFrame(() => {
            this.rowVirtualizer.scrollToOffset(offset);
            requestAnimationFrame(() => this.rowVirtualizer.scrollToOffset(offset));
          });
        });
      }
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
      if (this.lastRenderedRange?.start === range.start && this.lastRenderedRange.end === range.end) {
        return;
      }
      this.lastRenderedRange = range;
      this.renderedRange.emit(range);
    });
  }

  protected columnWidth(field: string): string {
    return `var(--book-browse-col-${field}-size)`;
  }

  protected pinnedOffset(field: string): string | null {
    return this.isPinned(field) ? `var(--book-browse-col-${field}-left)` : null;
  }

  protected isPinned(field: string): boolean {
    return this.columnPinning().start.includes(field);
  }

  protected isLastPinned(field: string): boolean {
    return this.columnPinning().start.at(-1) === field;
  }

  protected headerCellClass(field: string): string {
    return cn(
      HEADER_CELL_CLASS,
      this.isPinned(field) && 'sticky z-[5]',
      this.isLastPinned(field) && this.hasHorizontalOverlap() && 'border-r border-border/70',
      this.isNumeric(field) && 'text-right tabular-nums',
    );
  }

  protected bodyCellClass(field: string, empty = false): string {
    return cn(
      BODY_CELL_CLASS,
      this.isPinned(field) && 'sticky z-[2]',
      this.isLastPinned(field) && this.hasHorizontalOverlap() && 'border-r border-border/70',
      this.isNumeric(field) && 'justify-end text-right tabular-nums',
      empty && 'text-text-secondary',
    );
  }

  protected handleScroll(event: Event): void {
    this.hasHorizontalOverlap.set((event.currentTarget as HTMLElement).scrollLeft > 0);
  }

  protected isNumeric(field: string): boolean {
    const kind = bookBrowseColumnKind(field);
    return kind === 'number' || kind === 'rating' || kind === 'fileSize';
  }

  protected primaryAriaSort(header: Header<typeof features, BookSummary, unknown>): 'ascending' | 'descending' | null {
    if (header.column.getSortIndex() !== 0) {
      return null;
    }
    const sorted = header.column.getIsSorted();
    if (!sorted) {
      return null;
    }
    return sorted === 'asc' ? 'ascending' : 'descending';
  }

  protected toggleSort(header: Header<typeof features, BookSummary, unknown>, event: MouseEvent): void {
    header.column.getToggleSortingHandler()!(event);
  }

  protected startResize(header: Header<typeof features, BookSummary, unknown>, event: MouseEvent | TouchEvent): void {
    event.stopPropagation();
    header.getResizeHandler()(event);
  }

  protected resetWidth(header: Header<typeof features, BookSummary, unknown>, event: MouseEvent): void {
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
    this.changeRowSelection(book, index, !this.isSelected(book));
  }

  protected isSelected(book: BookSummary): boolean {
    const selection = this.selection();
    return selection.mode !== 'none' && selection.isSelected(book);
  }

  protected onRowContextMenu(book: BookSummary | undefined, event: MouseEvent): void {
    if (!book || this.mobile()) {
      return;
    }
    event.preventDefault();
    this.menuRequested.emit({book, request: contextMenuRequest(event)});
  }

  protected onRowMenu(book: BookSummary, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuRequested.emit({book, request: contextMenuRequest(event)});
  }

  protected detailHref(book: BookSummary): string {
    return this.locationStrategy.prepareExternalUrl(
      this.router.serializeUrl(this.router.createUrlTree(['/book', book.id])),
    );
  }

  protected onDetailClick(book: BookSummary, event: MouseEvent): void {
    if (!isPlainLeftClick(event)) {
      return;
    }
    event.preventDefault();
    this.detailRequested.emit(book);
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

  protected cellValue(cell: Cell<typeof features, BookSummary>): string {
    const value = cell.getValue();
    if (value == null || value === '') {
      return '—';
    }
    switch (bookBrowseColumnKind(cell.column.id)) {
      case 'date':
        return this.dateValue(String(value)) || '—';
      case 'fileSize':
        return this.fileSize(Number(value)) || '—';
      case 'rating':
        return this.ratingValue(Number(value)) || '—';
      case 'number':
        return this.numberValue(Number(value)) || '—';
      case 'readStatus':
        return this.readStatus(String(value)) || '—';
      case 'text':
        return String(value);
    }
  }

  protected cellLinks(book: BookSummary, field: string): readonly BookBrowseTableFacetRequest[] {
    return bookBrowseFacetLinks(book, field);
  }

  protected prepareOverflowMenu(
    links: readonly BookBrowseTableFacetRequest[],
    field: string,
  ): void {
    this.overflowLinks.set(links.slice(1));
    this.overflowMenuLabel.set(this.moreLinksLabel(field, links.length - 1));
  }

  protected moreLinksLabel(field: string, count: number): string {
    const column = this.renderedColumns().find(candidate => candidate.field === field)!.header;
    return this.transloco.translate('browse.table.moreValues', {count, column});
  }

  private sortDescFirst(field: string): boolean {
    return bookBrowseColumnSortDescFirst(field);
  }

  private dateValue(value: string | undefined): string {
    return value ? this.datePipe.transform(value, 'mediumDate')! : '';
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
    const labelKey = bookReadStatusLabelKey(status);
    return labelKey ? this.transloco.translate(labelKey) : '';
  }
}
