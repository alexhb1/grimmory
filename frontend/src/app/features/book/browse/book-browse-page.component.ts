import {ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, linkedSignal, signal, untracked, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, type ParamMap, Router} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {ConfirmationService, MessageService} from 'primeng/api';
import {injectMutation, injectQuery, QueryClient} from '@tanstack/angular-query-experimental';
import {injectQueries} from '@tanstack/angular-query-experimental/inject-queries-experimental';
import {type SortingState} from '@tanstack/angular-table';
import {take} from 'rxjs/operators';

import {
  BrowseGridComponent,
  type BrowseGridStatus,
} from '../../../shared/components/browse/browse-grid/browse-grid.component';
import {
  BrowseGridEmptyDef,
  BrowseGridItemDef,
  BrowseGridSkeletonDef,
} from '../../../shared/components/browse/browse-grid/browse-grid.directives';
import {BookCardComponent, bookCardHeightForWidth} from '../../../shared/components/cards/book-card/book-card.component';
import {BookCardMenuComponent} from '../../../shared/components/cards/book-card/book-card-menu.component';
import {
  READ_STATUS_TARGET_LABELS,
  READ_STATUS_TARGETS,
  type BookCardMenuCapabilities,
  type BookCardMenuShelf,
  type ReadStatusTarget,
} from '../../../shared/components/cards/book-card/book-card-menu';
import {BookCardSkeletonComponent} from '../../../shared/components/cards/book-card/book-card-skeleton.component';
import {AppPageHeaderComponent} from '../../../shared/layout/page-header/app.page-header.component';
import {type PageHeader} from '../../../shared/layout/page-header/page-header.service';
import {LayoutService} from '../../../shared/layout/layout.service';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {LocalStorageService} from '../../../shared/service/local-storage.service';
import {PageTitleService} from '../../../shared/service/page-title.service';
import {createGridDensity} from '../../../shared/util/grid-density.util';
import {type GridDensityDirection} from '../../../shared/components/grid-density-buttons/grid-density-buttons.component';
import {CoverScalePreferenceService} from '../components/book-browser/cover-scale-preference.service';
import {BookBrowseColumnPreferenceService} from './book-browse-column-preference.service';
import {ShelfDefinitionQueryService} from '../data/shelf-definition-query.service';
import {BookService} from '../service/book.service';
import {type EntityViewPreferenceOverride, UserService} from '../../settings/user-management/user.service';
import {BookDialogHelperService} from '../components/book-browser/book-dialog-helper.service';
import {type Book} from '../model/book.model';
import {BookFileService} from '../service/book-file.service';
import {
  legacyBookInvalidationSelectors,
  withLegacyBookInvalidation,
} from '../service/book-command-legacy-adapter';
import {EmailService} from '../../settings/email-v2/email.service';
import {SeriesCollapsePreferenceService} from './series-collapse-preference.service';
import {MetadataRefreshCommandService} from '../../metadata/data/metadata-refresh-command.service';
import {BookCommandService} from '../data/book-command.service';
import {BulkBookCommandPartialError, type BookProgressSource} from '../data/book-command.models';
import {BookBackgroundSubmissionService} from '../data/book-background-submission.service';
import {BookShelfCommandService} from '../data/book-shelf-command.service';
import {
  EMPTY_FACET_SELECTION,
  type BookPageParams,
  type BookSortTerm,
  normalizeBookPageParams,
} from '../data/book-query-params';
import {type BookFacetGroup} from '../data/book-query.models';
import {
  browseFacetQueryParams,
  buildRailGroups,
  countFacetSelections,
  cycleFacetValue,
  facetValuesForKey,
  freezeFacetOrders,
  mustFacetKeys,
  orderedFacetVocabularyKeys,
  parseBrowseFacetSelection,
  toggleFacetSelection,
  type FacetValueState,
  type FrozenFacetOrders,
} from './book-browse-facets';
import {AdvancedFilteringPreferenceService} from './advanced-filtering-preference.service';
import {BookBrowseSortLineService, bookSortLineAvailable} from './book-browse-sort-line.service';
import {cn} from '../../../shared/ui/cn';
import {AppButtonComponent} from '../../../shared/ui/button/app-button.component';
import {AppInputComponent} from '../../../shared/ui/input/app-input.component';
import {AppTagComponent} from '../../../shared/ui/tag/app-tag.component';
import {LucideBookmark, LucideCheck, LucideDatabase, LucideEllipsis, LucidePenLine, LucideSearch, LucideX} from '@lucide/angular';
import {AppMenuComponent} from '../../../shared/ui/menu/app-menu.component';
import {AppMenuItemComponent} from '../../../shared/ui/menu/app-menu-item.component';
import {AppMenuSeparatorComponent} from '../../../shared/ui/menu/app-menu-separator.component';
import {AppMenuTriggerForDirective} from '../../../shared/ui/menu/app-menu-trigger.directive';
import {ShelfMembershipMenuComponent} from '../../../shared/components/shelf-menu/shelf-membership-menu.component';
import {
  BrowseFilterRailComponent,
  type FilterRailGroup,
  type FilterRailToggle,
} from '../../../shared/components/browse/browse-filter-rail/browse-filter-rail.component';
import {BookBrowseToolbarComponent} from './book-browse-toolbar.component';
import {
  BulkActionsBarComponent,
  BulkActionsDividerComponent,
} from '../../../shared/components/bulk-actions/bulk-actions-bar.component';
import {
  buildSortOptions,
  DEFAULT_BOOK_SORT,
  parseSortTermsToken,
  parseSortToken,
  sortTerms,
  sortTermsToken,
  sortToken,
  type BookSortSelection,
} from './book-browse-sort.config';
import {type BookPage} from '../data/book-query.models';
import {BookQueryService} from '../data/book-query.service';
import {type BookReadStatus, type BookSummary} from '../data/book-response.models';
import {
  injectPendingBookDeletions,
  injectPendingBookMetadataLocks,
  injectPendingBookReadStatuses,
  injectPendingBookShelfMembership,
  overlayPendingBookState,
  type PendingBookOverlay,
} from '../data/book-command-pending-state';
import {createBookBrowseSelection} from './book-browse-selection';
import {BookBrowseTableComponent} from './book-browse-table.component';
import {type BookBrowseViewMode, type BrowseVisibleRange} from './book-browse.models';

const PAGE_SIZE = 60;
const RETAINED_PAGE_LIMIT = 40;
const QUERY_DEBOUNCE_MS = 300;

type EntityViewPreferenceContext = Pick<EntityViewPreferenceOverride, 'entityType' | 'entityId'>;

export function entityViewPreferenceContext(paramMap: ParamMap): EntityViewPreferenceContext | null {
  const candidates = [
    {param: 'libraryId', entityType: 'LIBRARY'},
    {param: 'shelfId', entityType: 'SHELF'},
    {param: 'magicShelfId', entityType: 'MAGIC_SHELF'},
  ] as const;

  for (const candidate of candidates) {
    const entityId = Number(paramMap.get(candidate.param));
    if (Number.isSafeInteger(entityId) && entityId > 0) {
      return {entityType: candidate.entityType, entityId};
    }
  }
  return null;
}

const RAIL_OPEN_STORAGE_KEY = 'browseFilterRailOpen';

const GRID_GAP = 16;
const CARD_BASE_WIDTH = 135;
const DESKTOP_MIN_SCALE = 0.5;
const DESKTOP_MAX_SCALE = 1.5;
const MOBILE_COLUMNS_STORAGE_KEY = 'mobileColumnsPreference';
const DEFAULT_MOBILE_COLUMNS = 3;
const MIN_MOBILE_COLUMNS = 2;
const MAX_MOBILE_COLUMNS = 4;

const BROWSE_PAGE_PARAMS: Omit<BookPageParams, 'sort'> = {
  size: PAGE_SIZE,
  facets: EMPTY_FACET_SELECTION,
};

const BULK_BAR_WIDTHS = {
  frame: 46,
  fixedSection: 245,
  addToShelf: 132,
  markAs: 100,
  more: 40,
  edit: 84,
  metadata: 110,
  deleteGroup: 88,
};

interface BookWindowState {
  paramsKey: string;
  totalElements: number | null;
  pages: ReadonlyMap<number, readonly BookSummary[]>;
  failedPages: ReadonlySet<number>;
}

interface BookPageQuerySnapshot {
  pageNumber: number;
  paramsKey: string;
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  data: BookPage | undefined;
  refetch: () => Promise<unknown>;
}

interface NumberedBookPage {
  pageNumber: number;
  paramsKey: string;
  page: BookPage;
}

export function neededPages(
  range: BrowseVisibleRange,
  pageSize: number,
  totalElements: number | null,
): number[] {
  if (pageSize <= 0 || range.end < range.start || totalElements === 0) {
    return [];
  }

  const maximumPage = totalElements == null
    ? null
    : Math.max(0, Math.ceil(totalElements / pageSize) - 1);
  const firstPage = Math.min(
    Math.max(0, Math.floor(range.start / pageSize) - 1),
    maximumPage ?? Number.MAX_SAFE_INTEGER,
  );
  const lastVisiblePage = Math.max(0, Math.floor(range.end / pageSize));
  const unboundedLastPage = lastVisiblePage + 1;
  const lastPage = totalElements == null
    ? unboundedLastPage
    : Math.min(unboundedLastPage, maximumPage ?? unboundedLastPage);

  return Array.from({length: lastPage - firstPage + 1}, (_, index) => firstPage + index);
}

export function assembleSparseBooks(
  pages: ReadonlyMap<number, readonly BookSummary[]>,
  totalElements: number | null,
  pageSize: number,
): readonly (BookSummary | undefined)[] {
  const loadedExtent = [...pages.entries()].reduce(
    (extent, [pageNumber, books]) => Math.max(extent, pageNumber * pageSize + books.length),
    0,
  );
  const books = new Array<BookSummary | undefined>(totalElements ?? loadedExtent);

  for (const [pageNumber, pageBooks] of pages) {
    const offset = pageNumber * pageSize;
    for (const [index, book] of pageBooks.entries()) {
      const targetIndex = offset + index;
      if (targetIndex < books.length) {
        books[targetIndex] = book;
      }
    }
  }

  return books;
}

export function pagesToEvict(
  pageNumbers: readonly number[],
  range: BrowseVisibleRange | null,
  pageSize: number,
  maximumPages: number,
): number[] {
  const excess = pageNumbers.length - maximumPages;
  if (excess <= 0) {
    return [];
  }

  const activeRange = range ?? {start: 0, end: 0};
  return [...pageNumbers]
    .sort((first, second) => {
      const distanceDifference = pageDistance(second, activeRange, pageSize) -
        pageDistance(first, activeRange, pageSize);
      return distanceDifference || second - first;
    })
    .slice(0, excess);
}

function pageDistance(
  pageNumber: number,
  range: BrowseVisibleRange,
  pageSize: number,
): number {
  const pageStart = pageNumber * pageSize;
  const pageEnd = pageStart + pageSize - 1;
  if (pageEnd < range.start) {
    return range.start - pageEnd;
  }
  if (pageStart > range.end) {
    return pageStart - range.end;
  }
  return 0;
}

@Component({
  selector: 'app-book-browse-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslocoPipe,
    AppPageHeaderComponent,
    BrowseGridComponent,
    BrowseGridItemDef,
    BrowseGridSkeletonDef,
    BrowseGridEmptyDef,
    BookCardComponent,
    BookCardMenuComponent,
    BookCardSkeletonComponent,
    BookBrowseToolbarComponent,
    BookBrowseTableComponent,
    BulkActionsBarComponent,
    BulkActionsDividerComponent,
    BrowseFilterRailComponent,
    AppButtonComponent,
    AppInputComponent,
    AppTagComponent,
    AppMenuComponent,
    AppMenuItemComponent,
    AppMenuSeparatorComponent,
    AppMenuTriggerForDirective,
    ShelfMembershipMenuComponent,
    LucideBookmark,
    LucideCheck,
    LucideDatabase,
    LucideEllipsis,
    LucidePenLine,
    LucideSearch,
    LucideX,
  ],
  templateUrl: './book-browse-page.component.html',
  host: {
    '(document:keydown.escape)': 'onEscapeKey()',
    '(document:keydown.control.a)': 'onSelectAllKey($event)',
    '(document:keydown.meta.a)': 'onSelectAllKey($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class BookBrowsePageComponent implements OnInit {
  protected readonly browsePageSize = PAGE_SIZE;
  private readonly bookQuery = inject(BookQueryService);
  private readonly queryClient = inject(QueryClient);
  private readonly transloco = inject(TranslocoService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly layout = inject(LayoutService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly coverScale = inject(CoverScalePreferenceService);
  protected readonly columnPreferences = inject(BookBrowseColumnPreferenceService);
  private readonly seriesCollapse = inject(SeriesCollapsePreferenceService);
  private readonly sortLine = inject(BookBrowseSortLineService);
  private readonly advancedFiltering = inject(AdvancedFilteringPreferenceService);
  private readonly shelfDefinitionQuery = inject(ShelfDefinitionQueryService);
  private readonly bookService = inject(BookService);
  private readonly userService = inject(UserService);
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly bookCommand = inject(BookCommandService);
  private readonly shelfCommand = inject(BookShelfCommandService);
  private readonly metadataRefresh = inject(MetadataRefreshCommandService);
  private readonly backgroundSubmission = inject(BookBackgroundSubmissionService);
  private readonly dialogHelper = inject(BookDialogHelperService);
  private readonly bookFileService = inject(BookFileService);
  private readonly emailService = inject(EmailService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly pendingReadStatuses = injectPendingBookReadStatuses();
  private readonly pendingShelfMembership = injectPendingBookShelfMembership();
  private readonly pendingMetadataLocks = injectPendingBookMetadataLocks();
  protected readonly pendingDeletions = injectPendingBookDeletions();

  private readonly shelfDefinitionsQuery = injectQuery(() => this.shelfDefinitionQuery.definitions());
  private readonly pendingBookOverlay = computed<PendingBookOverlay>(() => ({
    readStatuses: this.pendingReadStatuses(),
    shelfMembership: this.pendingShelfMembership(),
    metadataLocks: this.pendingMetadataLocks(),
    shelfNamesById: new Map(
      (this.shelfDefinitionsQuery.data() ?? []).map(shelf => [shelf.id, shelf.name]),
    ),
  }));
  private readonly shelfMembershipMutation = injectMutation(() => withLegacyBookInvalidation(
    this.shelfCommand.updateMembership(),
    legacyBookInvalidationSelectors.shelfMembership,
  ));
  private readonly readStatusMutation = injectMutation(() => withLegacyBookInvalidation(
    this.bookCommand.setReadStatus(),
    legacyBookInvalidationSelectors.readStatus,
  ));
  private readonly refreshMetadataMutation = injectMutation(() => withLegacyBookInvalidation(
    this.metadataRefresh.refreshMetadata(),
    result => result.target.kind === 'books'
      ? {changedBookIds: result.target.bookIds}
      : {allBooks: true},
  ));
  private readonly deleteBooksMutation = injectMutation(() => withLegacyBookInvalidation(
    this.bookCommand.deleteBooks(),
    legacyBookInvalidationSelectors.deleteBooks,
  ));
  private readonly resetProgressMutation = injectMutation(() => withLegacyBookInvalidation(
    this.bookCommand.resetProgress(),
    legacyBookInvalidationSelectors.resetProgress,
  ));
  private readonly metadataLocksMutation = injectMutation(() => withLegacyBookInvalidation(
    this.bookCommand.setAllMetadataLocks(),
    legacyBookInvalidationSelectors.metadataAllLocks,
  ));
  private readonly changeCoversMutation = injectMutation(() => this.backgroundSubmission.changeCovers());

  private readonly gridRef = viewChild(BrowseGridComponent);
  private readonly tableRef = viewChild(BookBrowseTableComponent);
  private readonly cardMenu = viewChild(BookCardMenuComponent);
  private readonly isMobile = computed(() => !this.layout.isDesktop());
  protected readonly mobileSelectMode = signal(false);
  private readonly bulkBar = viewChild(BulkActionsBarComponent);
  private readonly bulkBarFit = computed(() => {
    const available = this.bulkBar()?.availableWidth() ?? 0;
    const capabilities = this.menuCapabilities();
    const w = BULK_BAR_WIDTHS;
    let used = w.frame + w.more + (this.isMobile() ? 0 : w.fixedSection);
    let fitting = true;
    const take = (width: number): boolean => {
      fitting = fitting && used + width <= available;
      if (fitting) used += width;
      return fitting;
    };
    return {
      addToShelf: take(w.addToShelf),
      markAs: take(w.markAs),
      edit: capabilities.canEditMetadata && take(w.edit),
      metadata: this.bulkMetadataAvailable() && take(w.metadata),
      delete: capabilities.canDeleteBook && take(w.deleteGroup),
    };
  });
  protected readonly bulkBarShowsAddToShelf = computed(() => this.bulkBarFit().addToShelf);
  protected readonly bulkBarShowsMarkAs = computed(() => this.bulkBarFit().markAs);
  protected readonly bulkBarShowsEdit = computed(() => this.bulkBarFit().edit);
  protected readonly bulkBarShowsMetadata = computed(() => this.bulkBarFit().metadata);
  protected readonly bulkBarShowsDelete = computed(() => this.bulkBarFit().delete);
  private readonly screenWidth = signal(typeof window !== 'undefined' ? window.innerWidth : 1024);
  private readonly gridDensity = createGridDensity(this.localStorage, {
    useFixedColumns: this.isMobile,
    screenWidth: this.screenWidth,
    storageKey: MOBILE_COLUMNS_STORAGE_KEY,
    defaultColumns: DEFAULT_MOBILE_COLUMNS,
    minColumns: MIN_MOBILE_COLUMNS,
    maxColumns: MAX_MOBILE_COLUMNS,
    scale: this.coverScale.scaleFactor,
    minScale: DESKTOP_MIN_SCALE,
    maxScale: DESKTOP_MAX_SCALE,
    gap: GRID_GAP,
    baseWidth: computed(() => CARD_BASE_WIDTH),
    setScale: scale => this.coverScale.setScale(scale),
  });
  protected readonly gridGap = this.gridDensity.gap;
  protected readonly gridRowGap = this.gridDensity.rowGap;
  protected readonly gridColumns = this.gridDensity.columns;
  protected readonly densitySmallerDisabled = this.gridDensity.smallerDisabled;
  protected readonly densityLargerDisabled = this.gridDensity.largerDisabled;
  protected readonly minCardWidth = computed(() =>
    this.isMobile() ? 1 : Math.round(CARD_BASE_WIDTH * this.coverScale.scaleFactor()),
  );
  protected readonly seriesCollapsed = this.seriesCollapse.seriesCollapsed;

  private readonly railOpen = signal(this.localStorage.get<boolean>(RAIL_OPEN_STORAGE_KEY) === true);
  protected readonly railVisible = computed(() => !this.isMobile() && this.railOpen());
  protected readonly filtersOpen = this.railOpen.asReadonly();
  private readonly facetsQuery = injectQuery(() => ({
    ...this.bookQuery.facets({
      facets: this.facetSelections(),
      sort: [],
      query: this.queryText() || undefined,
    }),
    enabled: this.railVisible(),
    placeholderData: (previous: BookFacetGroup[] | undefined) => previous,
  }));
  private readonly unfilteredFacetsQuery = injectQuery(() => ({
    ...this.bookQuery.facets({facets: EMPTY_FACET_SELECTION, sort: []}),
  }));
  protected readonly serverSortKeys = computed<readonly string[]>(() => {
    const sortGroup = this.unfilteredFacetsQuery.data()?.find(group => group.rel === 'sort');
    const seen = new Set<string>();
    return (sortGroup?.values ?? []).flatMap(link => {
      if (!link.value || link.value.startsWith('-') || seen.has(link.value)) {
        return [];
      }
      seen.add(link.value);
      return [link.value];
    });
  });
  protected readonly sortOptions = computed(() => buildSortOptions(this.serverSortKeys()));
  protected readonly sortableFields = computed<ReadonlySet<string>>(
    () => new Set(this.serverSortKeys()),
  );
  private readonly frozenFacets = computed<FrozenFacetOrders | null>(() => {
    const data = this.unfilteredFacetsQuery.data();
    return data && data.length > 0 ? freezeFacetOrders(data) : null;
  });
  private readonly displayedMustKeys = linkedSignal({
    source: () => this.facetsQuery.data(),
    computation: (): ReadonlySet<string> => untracked(() => mustFacetKeys(this.facetSelections())),
  });
  protected readonly railGroups = computed<FilterRailGroup[]>(() =>
    buildRailGroups(
      this.facetsQuery.data() ?? [],
      this.facetSelections(),
      this.frozenFacets() ?? undefined,
      this.displayedMustKeys(),
    ),
  );
  private readonly headerRef = viewChild(AppPageHeaderComponent);
  protected readonly chipsBandClass = computed(() =>
    cn(
      'sticky top-[var(--page-stuck-offset)] z-10 -mx-4 bg-page px-4 pb-3 pt-1',
      this.headerRef()?.isStuck() &&
        'shadow-[0_1px_0_0_color-mix(in_srgb,var(--color-border)_70%,transparent)]',
    ),
  );
  protected readonly hairlineStripClass = computed(() =>
    cn(
      'sticky top-[var(--page-stuck-offset)] z-10 -mx-4 h-0 border-b',
      this.headerRef()?.isStuck() ? 'border-border/70' : 'border-transparent',
    ),
  );
  protected readonly filterChips = computed(() => {
    const selections = this.facetSelections();
    const frozen = this.frozenFacets();
    const vocabularyKeys = orderedFacetVocabularyKeys(
      this.unfilteredFacetsQuery.data() ?? [],
      frozen ?? undefined,
    );
    const vocabularySet = new Set(vocabularyKeys);
    const selectionKeys = [selections.any, selections.must, selections.not]
      .flatMap(bucket => Object.keys(bucket));
    const keys = [
      ...vocabularyKeys,
      ...selectionKeys.filter((key, index) =>
        !vocabularySet.has(key) && selectionKeys.indexOf(key) === index),
    ];
    return keys.flatMap(key => {
      const stateOf = new Map<string, FacetValueState>();
      for (const value of facetValuesForKey(selections.any, key)) {
        stateOf.set(value, 'any');
      }
      for (const value of facetValuesForKey(selections.must, key)) {
        stateOf.set(value, 'must');
      }
      for (const value of facetValuesForKey(selections.not, key)) {
        stateOf.set(value, 'not');
      }
      if (stateOf.size === 0) {
        return [];
      }
      const frozenGroup = frozen && Object.hasOwn(frozen, key) ? frozen[key] : undefined;
      const frozenIndex = new Map((frozenGroup?.values ?? []).map((item, index) => [item.value, index]));
      return [...stateOf.entries()]
        .sort(([a], [b]) => {
          const indexA = frozenIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
          const indexB = frozenIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
          return indexA - indexB || a.localeCompare(b);
        })
        .map(([value, state]) => ({
          key,
          value,
          state,
          groupLabel: frozenGroup?.title ?? key,
          valueLabel: frozenGroup?.values.find(item => item.value === value)?.label ?? value,
        }));
    });
  });

  protected chipColor(state: FacetValueState): 'neutral' | 'primary' | 'red' {
    switch (state) {
      case 'any':
        return 'neutral';
      case 'must':
        return 'primary';
      case 'not':
        return 'red';
    }
  }

  protected chipValueClass(state: FacetValueState): string {
    return cn(
      'max-w-48 truncate',
      state === 'must' && 'font-[550]',
      state === 'not' && 'line-through',
    );
  }

  private readonly menuBookSnapshot = signal<BookSummary | null>(null);
  protected readonly openMenuBookId = signal<number | null>(null);
  protected readonly menuBook = computed<BookSummary | null>(() => {
    const snapshot = this.menuBookSnapshot();
    if (!snapshot) {
      return null;
    }
    return this.books().find(book => book?.id === snapshot.id) ?? snapshot;
  });
  protected readonly menuReadStatus = computed(() => this.menuBook()?.readStatus ?? null);
  protected readonly menuCapabilities = computed<BookCardMenuCapabilities>(() => {
    const permissions = this.userService.currentUser()?.permissions;
    return {
      canDownload: !!permissions?.canDownload,
      canEmailBook: !!permissions?.canEmailBook,
      canEditMetadata: !!permissions?.canEditMetadata,
      canDeleteBook: !!permissions?.canDeleteBook,
    };
  });
  protected readonly menuShelves = computed<BookCardMenuShelf[]>(() => {
    const book = this.menuBook();
    if (!book) {
      return [];
    }
    const onShelfIds = new Set((book.shelves ?? []).map(shelf => shelf.id));
    return (this.shelfDefinitionsQuery.data() ?? [])
      .map(shelf => ({id: shelf.id, name: shelf.name, checked: onShelfIds.has(shelf.id)}));
  });

  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly routeParamMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  protected readonly activeSortTerms = computed<readonly BookSortTerm[]>(() => {
    const terms = parseSortTermsToken(this.queryParamMap().get('sort'));
    return terms.length > 0 ? terms : sortTerms(DEFAULT_BOOK_SORT);
  });
  protected readonly activeSort = computed<BookSortSelection>(() =>
    parseSortToken(sortTermsToken(this.activeSortTerms())) ?? DEFAULT_BOOK_SORT,
  );
  protected readonly viewMode = computed<BookBrowseViewMode>(() => {
    const requestedView = this.queryParamMap().get('view');
    if (requestedView === 'grid' || requestedView === 'table') {
      return requestedView;
    }
    const preferences = this.userService.currentUser()?.userSettings?.entityViewPreferences;
    const context = entityViewPreferenceContext(this.routeParamMap());
    const preference = context
      ? preferences?.overrides?.find(override =>
          override.entityType === context.entityType && override.entityId === context.entityId,
        )?.preferences ?? preferences?.global
      : preferences?.global;
    return preference?.view === 'TABLE'
      ? 'table'
      : 'grid';
  });
  protected readonly mobileTableLayout = computed(
    () => this.isMobile() && this.viewMode() === 'table',
  );
  protected readonly visibleTableColumns = computed(() => {
    this.activeLang();
    return this.columnPreferences.visibleColumns;
  });
  protected readonly tableColumnOptions = computed(() => {
    this.activeLang();
    const preferences = new Map(
      this.columnPreferences.preferences().map(preference => [preference.field, preference.visible]),
    );
    return this.columnPreferences.allColumns.map(column => ({
      ...column,
      visible: column.field === 'title' || preferences.get(column.field) === true,
    }));
  });
  protected readonly tableSorting = computed<SortingState>(() =>
    this.activeSortTerms().map(term => ({id: term.key, desc: term.direction === 'desc'})),
  );
  private readonly facetSelections = computed(() =>
    parseBrowseFacetSelection(
      this.queryParamMap().getAll('facet'),
      this.queryParamMap().getAll('facet_must'),
      this.queryParamMap().getAll('facet_not'),
    ),
  );
  protected readonly filterCount = computed(() => countFacetSelections(this.facetSelections()));
  protected readonly queryText = computed(() => (this.queryParamMap().get('query') ?? '').trim());
  protected readonly queryDraft = signal(this.route.snapshot.queryParamMap.get('query') ?? '');
  private queryDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly activeFilterCount = computed(() => this.filterCount() + (this.queryText() ? 1 : 0));
  private readonly params = computed<BookPageParams>(() => ({
    ...BROWSE_PAGE_PARAMS,
    facets: this.facetSelections(),
    sort: this.activeSortTerms(),
    query: this.queryText() || undefined,
  }));
  private readonly normalizedParams = computed(() => normalizeBookPageParams(this.params()));
  private readonly paramsKey = computed(() => JSON.stringify(this.normalizedParams()));
  private readonly visibleRange = signal<BrowseVisibleRange | null>(null);
  private readonly windowState = signal<BookWindowState>({
    paramsKey: this.paramsKey(),
    totalElements: null,
    pages: new Map(),
    failedPages: new Set(),
  });
  private readonly retrySuppressedPages = signal<ReadonlySet<number>>(new Set());

  private readonly currentState = computed<BookWindowState>(() => {
    const state = this.windowState();
    if (state.paramsKey === this.paramsKey()) {
      return state;
    }
    return {
      paramsKey: this.paramsKey(),
      totalElements: null,
      pages: new Map(),
      failedPages: new Set(),
    };
  });
  private readonly pagesNeeded = computed(() => {
    const totalElements = this.currentState().totalElements;
    const range = this.visibleRange();
    if (totalElements == null || range == null) {
      return [0];
    }
    return neededPages(range, PAGE_SIZE, totalElements);
  });
  private readonly pageQueryResults = injectQueries(() => {
    const params = this.normalizedParams();
    const paramsKey = this.paramsKey();

    return {
      queries: this.pagesNeeded().map(pageNumber => ({
        ...this.bookQuery.pageAt({...params, page: pageNumber}),
        select: (page: BookPage): NumberedBookPage => ({pageNumber, paramsKey, page}),
      })),
    };
  });
  private readonly pageQueries = computed(() => {
    const pageNumbers = this.pagesNeeded();
    const paramsKey = this.paramsKey();

    return this.pageQueryResults().map((result, index): BookPageQuerySnapshot => ({
        pageNumber: result.data()?.pageNumber ?? pageNumbers[index],
        paramsKey: result.data()?.paramsKey ?? paramsKey,
        status: result.status(),
        fetchStatus: result.fetchStatus(),
        data: result.data()?.page,
        refetch: () => result.refetch(),
      }));
  });
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly books = computed<readonly (BookSummary | undefined)[]>(() => {
    const state = this.currentState();
    const books = assembleSparseBooks(state.pages, state.totalElements, PAGE_SIZE);
    const overlay = this.pendingBookOverlay();
    if (overlay.readStatuses.size === 0
      && overlay.shelfMembership.size === 0
      && overlay.metadataLocks.size === 0) {
      return books;
    }
    return books.map(book => book ? overlayPendingBookState(book, overlay) : undefined);
  });
  protected readonly loadedBooks = computed<BookSummary[]>(() => {
    const books = [...this.currentState().pages.entries()]
      .sort(([first], [second]) => first - second)
      .flatMap(([, books]) => books);
    const overlay = this.pendingBookOverlay();
    if (overlay.readStatuses.size === 0
      && overlay.shelfMembership.size === 0
      && overlay.metadataLocks.size === 0) {
      return books;
    }
    return books.map(book => overlayPendingBookState(book, overlay));
  });
  protected readonly total = computed(() => this.currentState().totalElements);
  protected readonly status = computed<BrowseGridStatus>(() => {
    const state = this.currentState();
    if (state.totalElements != null || state.pages.size > 0) {
      return 'success';
    }
    return state.failedPages.size > 0 ? 'error' : 'pending';
  });
  protected readonly nextPageError = computed(() =>
    this.status() === 'success' && this.currentState().failedPages.size > 0,
  );
  protected readonly failedTablePages = computed(() => this.currentState().failedPages);

  protected readonly selection = createBookBrowseSelection({
    paramsKey: this.paramsKey,
    books: this.books,
    totalElements: this.total,
    fetchIds: () => this.queryClient.fetchQuery(this.bookQuery.ids(this.normalizedParams())),
  });
  protected readonly selectionEnabled = computed(() => !this.isMobile() || this.mobileSelectMode());
  protected readonly allBooksSelected = this.selection.allCurrentResultsSelected;
  protected readonly someBooksSelected = computed(() =>
    this.selection.count() > 0 && !this.allBooksSelected(),
  );

  protected readonly readStatusTargets = READ_STATUS_TARGETS;
  protected readonly bulkShelves = computed(() => {
    const selectedIds = this.selection.selectedIds();
    const evidenced: BookSummary[] = [];
    for (const book of this.books()) {
      if (book && selectedIds.has(book.id)) {
        evidenced.push(book);
      }
    }
    const complete = evidenced.length === this.selection.count();
    return (this.shelfDefinitionsQuery.data() ?? []).map(shelf => {
      let onCount = 0;
      for (const book of evidenced) {
        if ((book.shelves ?? []).some(entry => entry.id === shelf.id)) {
          onCount++;
        }
      }
      const checked = complete && evidenced.length > 0 && onCount === evidenced.length;
      return {
        id: shelf.id,
        name: shelf.name,
        checked,
        mixed: !checked && (onCount > 0 || !complete),
      };
    });
  });

  private readonly sortLineKey = computed<string | null>(() => {
    const key = this.activeSort().option.id;
    return bookSortLineAvailable(key) ? key : null;
  });

  protected sortLineFor(book: BookSummary): string | null {
    const key = this.sortLineKey();
    return key === null ? null : this.sortLine.lineFor(key, book);
  }

  protected readonly estimateItemHeight = (width: number): number =>
    bookCardHeightForWidth(width, {metaLines: this.sortLineKey() === null ? 2 : 3});

  protected readonly pageHeader = computed<PageHeader>(() => {
    this.activeLang();
    const total = this.total();
    return {
      title: this.transloco.translate('browse.book.title'),
      count: total == null ? undefined : total.toLocaleString(),
    };
  });

  protected readonly searchHint = computed(() =>
    this.transloco.translate('browse.rail.search', {scope: this.pageHeader().title}),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.queryDebounceTimer != null) {
        clearTimeout(this.queryDebounceTimer);
      }
    });

    effect(() => {
      const preferences = this.userService.currentUser()?.userSettings?.tableColumnPreference;
      untracked(() => this.columnPreferences.initialize(preferences));
    });

    effect(() => {
      if (!this.isMobile() && untracked(this.mobileSelectMode)) {
        untracked(() => this.mobileSelectMode.set(false));
      }
    });

    effect(() => {
      const query = this.queryText();
      untracked(() => {
        if (this.queryDebounceTimer == null && this.queryDraft().trim() !== query) {
          this.queryDraft.set(query);
        }
      });
    });

    effect(() => {
      const paramsKey = this.paramsKey();
      if (untracked(this.windowState).paramsKey === paramsKey) {
        return;
      }

      untracked(() => {
        this.windowState.set({
          paramsKey,
          totalElements: null,
          pages: new Map(),
          failedPages: new Set(),
        });
        this.retrySuppressedPages.set(new Set());
        this.visibleRange.set(null);
        this.tableRef()?.scrollToTop();
        this.gridRef()?.scrollToTop();
      });
    });

    effect(() => {
      const paramsKey = this.paramsKey();
      const snapshots = this.pageQueries().filter(snapshot => snapshot.paramsKey === paramsKey);
      const suppressedPages = this.retrySuppressedPages();
      const currentState = untracked(this.currentState);
      const startedRetries = snapshots
        .filter(snapshot => snapshot.fetchStatus === 'fetching' && suppressedPages.has(snapshot.pageNumber))
        .map(snapshot => snapshot.pageNumber);
      const successes = snapshots.filter(snapshot =>
        snapshot.status === 'success' &&
        snapshot.data != null &&
        currentState.pages.get(snapshot.pageNumber) !== snapshot.data.content,
      );
      const failures = snapshots.filter(snapshot =>
        snapshot.status === 'error' &&
        snapshot.fetchStatus === 'idle' &&
        !suppressedPages.has(snapshot.pageNumber) &&
        !currentState.failedPages.has(snapshot.pageNumber),
      );

      if (startedRetries.length === 0 && successes.length === 0 && failures.length === 0) {
        return;
      }

      untracked(() => {
        if (startedRetries.length > 0) {
          this.retrySuppressedPages.update(current => {
            const next = new Set(current);
            for (const pageNumber of startedRetries) {
              next.delete(pageNumber);
            }
            return next;
          });
        }

        this.windowState.update(current => {
          if (current.paramsKey !== paramsKey) {
            return current;
          }

          const pages = new Map(current.pages);
          const failedPages = new Set(current.failedPages);
          let totalElements = current.totalElements;

          for (const snapshot of successes) {
            const page = snapshot.data;
            if (!page) {
              continue;
            }
            pages.set(snapshot.pageNumber, page.content);
            failedPages.delete(snapshot.pageNumber);
            totalElements = page.page.totalElements;
          }
          for (const snapshot of failures) {
            failedPages.add(snapshot.pageNumber);
          }

          for (const pageNumber of pagesToEvict(
            [...pages.keys()],
            this.visibleRange(),
            PAGE_SIZE,
            RETAINED_PAGE_LIMIT,
          )) {
            pages.delete(pageNumber);
          }

          return {paramsKey, totalElements, pages, failedPages};
        });
      });
    });
  }

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.transloco.translate('browse.book.title'));
  }

  protected onVisibleRange(range: BrowseVisibleRange): void {
    this.visibleRange.set(range);
  }

  protected onSeriesCollapsedChange(value: boolean): void {
    this.seriesCollapse.setSeriesCollapsed(value);
  }

  protected onViewModeChange(view: BookBrowseViewMode): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {view},
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onTableColumnVisibilityChange(change: {field: string; visible: boolean}): void {
    this.columnPreferences.setVisibility(change.field, change.visible);
  }

  protected onMobileSelectToggle(): void {
    if (this.mobileSelectMode()) {
      this.selection.clear();
      this.mobileSelectMode.set(false);
      return;
    }
    this.mobileSelectMode.set(true);
  }

  protected onTableFacetRequested(request: {key: string; value: string}): void {
    this.onToggleFacet({...request, selected: true});
  }

  protected onCardAction(book: BookSummary): void {
    this.bookService.readBook(book.id);
  }

  protected onToggleSelect(book: BookSummary, index: number, shiftKey: boolean): void {
    this.selection.toggle(book, index, shiftKey);
  }

  protected isTableRowSelected = (book: BookSummary, index: number): boolean =>
    this.selection.isSelected(book.id, index);

  protected onTableSelectionChange(change: {
    book: BookSummary;
    index: number;
    checked: boolean;
    shiftKey: boolean;
  }): void {
    if (change.checked !== this.selection.isSelected(change.book.id, change.index) || change.shiftKey) {
      this.selection.toggle(change.book, change.index, change.shiftKey);
    }
  }

  protected onEscapeKey(): void {
    if (this.openMenuBookId() === null && this.selection.active()) {
      this.selection.clear();
      return;
    }
    if (this.openMenuBookId() === null && this.mobileSelectMode()) {
      this.mobileSelectMode.set(false);
    }
  }

  protected onDocumentClick(event: Event): void {
    if (!this.selection.active()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const exempt = target.closest(
      'app-book-card, app-bulk-actions-bar, app-menu, app-page-header, aside, ' +
      'app-book-browse-table, ' +
      '.cdk-overlay-container, .p-dialog-mask, [role="dialog"], ' +
      'button, a, input, textarea, select, label',
    );
    if (exempt === null) {
      this.selection.clear();
    }
  }

  protected statusLabel(status: ReadStatusTarget): string {
    return READ_STATUS_TARGET_LABELS[status];
  }

  private readonly shelfUpdateErrorToast = (error: unknown): void => this.messageService.add({
    severity: 'error',
    summary: this.transloco.translate('common.error'),
    detail: (error as {error?: {message?: string}})?.error?.message
      || this.transloco.translate('book.shelfAssigner.toast.updateFailedDetail'),
  });

  private readonly readStatusErrorToast = (error: unknown): void => this.messageService.add({
    severity: 'error',
    summary: this.transloco.translate('book.card.toast.readStatusFailedSummary'),
    detail: (error as {error?: {message?: string}})?.error?.message
      || this.transloco.translate('book.card.toast.readStatusFailedDetail'),
  });

  private readonly metadataRefreshErrorToast = (error: unknown): void => {
    const conflict = (error as {status?: number})?.status === 409;
    this.messageService.add({
      severity: 'error',
      summary: this.transloco.translate(conflict
        ? 'settingsTasks.toast.alreadyRunning'
        : 'settingsTasks.toast.metadataFailed'),
      detail: this.transloco.translate(conflict
        ? 'settingsTasks.toast.metadataAlreadyRunningDetail'
        : 'settingsTasks.toast.metadataFailedDetail'),
      life: 5000,
    });
  };

  private readonly deleteErrorToast = (error: unknown): void => this.messageService.add({
    severity: 'error',
    summary: this.transloco.translate('book.bookService.toast.deleteFailedSummary'),
    detail: (error as {error?: {message?: string}})?.error?.message
      || this.transloco.translate('book.bookService.toast.deleteFailedDetail'),
  });

  protected async onBulkToggleShelf(shelfId: number, checked: boolean): Promise<void> {
    const bookIds = await this.selection.resolvedIds().catch(() => null);
    if (!bookIds) {
      return;
    }
    this.shelfMembershipMutation.mutate({
      bookIds: [...bookIds],
      assignShelfIds: checked ? [shelfId] : [],
      unassignShelfIds: checked ? [] : [shelfId],
    }, {onError: this.shelfUpdateErrorToast});
  }

  protected onBulkEditAll(): void {
    void this.selection.resolvedIds()
      .then(bookIds => this.dialogHelper.openBulkMetadataEditDialog(new Set(bookIds)))
      .then(ref => ref?.onClose.pipe(take(1)).subscribe(() => this.selection.clear()))
      .catch(() => undefined);
  }

  protected onBulkEditOneByOne(): void {
    void this.selection.resolvedIds()
      .then(bookIds => this.dialogHelper.openMultibookMetadataEditorDialog(new Set(bookIds)))
      .then(ref => ref?.onClose.pipe(take(1)).subscribe(() => this.selection.clear()))
      .catch(() => undefined);
  }

  protected onBulkLockUnlockMetadata(): void {
    void this.selection.resolvedIds()
      .then(bookIds => this.dialogHelper.openLockUnlockMetadataDialog(new Set(bookIds)))
      .then(ref => ref?.onClose.pipe(take(1)).subscribe(() => this.selection.clear()))
      .catch(() => undefined);
  }

  protected onBulkOrganizeFiles(): void {
    void this.selection.resolvedIds()
      .then(bookIds => this.dialogHelper.openFileMoverDialog(new Set(bookIds)))
      .catch(() => undefined);
  }

  protected onBulkAttachFiles(): void {
    const selectedIds = this.selection.selectedIds();
    const sourceBooks: Book[] = [];
    for (const book of this.books()) {
      if (book && selectedIds.has(book.id)) {
        sourceBooks.push(book as unknown as Book);
      }
    }
    void this.dialogHelper.openBulkBookFileAttacherDialog(sourceBooks)
      .then(ref => ref?.onClose.pipe(take(1)).subscribe((result: {success?: boolean} | undefined) => {
        if (result?.success) {
          this.selection.clear();
        }
      }))
      .catch(() => undefined);
  }

  protected readonly canBulkResetGrimmory = computed(() =>
    !!this.userService.currentUser()?.permissions?.canBulkResetGrimmoryReadProgress,
  );
  protected readonly canBulkLockUnlockMetadata = computed(() =>
    !!this.userService.currentUser()?.permissions?.canBulkLockUnlockMetadata,
  );
  protected readonly bulkMetadataAvailable = computed(() =>
    this.menuCapabilities().canEditMetadata || this.canBulkLockUnlockMetadata(),
  );
  protected readonly canBulkResetKoreader = computed(() =>
    !!this.userService.currentUser()?.permissions?.canBulkResetKoReaderReadProgress,
  );
  protected readonly canBulkOrganizeFiles = computed(() =>
    !!this.userService.currentUser()?.permissions?.canMoveOrganizeFiles
      && this.appSettingsService.appSettings()?.diskType === 'LOCAL',
  );
  protected readonly canBulkAttachFiles = computed(() => {
    const permissions = this.userService.currentUser()?.permissions;
    return !!permissions?.canManageLibrary || !!permissions?.admin;
  });
  protected readonly bulkAttachEligible = computed(() => {
    if (this.selection.count() === 0) {
      return false;
    }
    const selectedIds = this.selection.selectedIds();
    const evidenced: BookSummary[] = [];
    for (const book of this.books()) {
      if (book && selectedIds.has(book.id)) {
        evidenced.push(book);
      }
    }
    return evidenced.length === this.selection.count()
      && new Set(evidenced.map(book => book.libraryId)).size === 1;
  });
  protected readonly bulkMoreMenuHasItems = computed(() => {
    const capabilities = this.menuCapabilities();
    return !this.bulkBarShowsAddToShelf()
      || !this.bulkBarShowsMarkAs()
      || (this.bulkMetadataAvailable() && !this.bulkBarShowsMetadata())
      || this.canBulkResetGrimmory()
      || this.canBulkResetKoreader()
      || this.canBulkOrganizeFiles()
      || this.canBulkAttachFiles()
      || (capabilities.canDeleteBook && !this.bulkBarShowsDelete());
  });

  protected onBulkResetProgress(source: BookProgressSource): void {
    void this.selection.resolvedIds()
      .then(bookIds => this.resetProgressMutation.mutate({bookIds: [...bookIds], source}, {
        onError: error => this.messageService.add({
          severity: 'error',
          summary: this.transloco.translate('book.card.toast.progressResetFailedSummary'),
          detail: (error as {error?: {message?: string}})?.error?.message
            || this.transloco.translate(source === 'KOREADER'
              ? 'book.card.toast.progressResetKOReaderFailedDetail'
              : 'book.card.toast.progressResetGrimmoryFailedDetail'),
        }),
      }))
      .catch(() => undefined);
  }

  protected onBulkSetMetadataLocks(locked: boolean): void {
    void this.selection.resolvedIds()
      .then(bookIds => this.metadataLocksMutation.mutate({bookIds: [...bookIds], locked}, {
        onError: error => this.messageService.add({
          severity: 'error',
          summary: this.transloco.translate('metadata.editor.toast.errorSummary'),
          detail: (error as {error?: {message?: string}})?.error?.message
            || this.transloco.translate('metadata.editor.toast.lockStateFailed'),
        }),
      }))
      .catch(() => undefined);
  }

  protected onBulkChangeCovers(kind: 'regenerate' | 'generate'): void {
    const regenerate = kind === 'regenerate';
    this.confirmationService.confirm({
      message: this.transloco.translate(
        regenerate ? 'book.browser.confirm.regenCoverMessage' : 'book.browser.confirm.customCoverMessage',
        {count: this.selection.count().toLocaleString()},
      ),
      header: this.transloco.translate(
        regenerate ? 'book.browser.confirm.regenCoverHeader' : 'book.browser.confirm.customCoverHeader',
      ),
      acceptLabel: this.transloco.translate('common.confirm'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => {
        void this.selection.resolvedIds()
          .then(bookIds => this.changeCoversMutation.mutate({kind, bookIds}, {
            onError: error => this.messageService.add({
              severity: 'error',
              summary: this.transloco.translate('book.card.toast.failedSummary'),
              detail: (error as {error?: {message?: string}})?.error?.message
                || this.transloco.translate(regenerate
                  ? 'book.card.toast.regenCoverFailedDetail'
                  : 'book.card.toast.customCoverFailedDetail'),
            }),
          }))
          .catch(() => undefined);
      },
    });
  }

  protected onBulkFetchMetadata(): void {
    void this.selection.resolvedIds()
      .then(bookIds => this.refreshMetadataMutation.mutate(
        {target: {kind: 'books', bookIds: [...bookIds]}},
        {onError: this.metadataRefreshErrorToast},
      ))
      .catch(() => undefined);
  }

  protected onBulkFetchMetadataWithOptions(): void {
    void this.selection.resolvedIds()
      .then(bookIds => this.dialogHelper.openMetadataRefreshDialog(new Set(bookIds)))
      .catch(() => undefined);
  }

  protected readonly bulkDeleting = computed(() => this.pendingDeletions().size > 0);

  protected onBulkDelete(): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('book.browser.confirm.deleteMessage', {
        count: this.selection.count().toLocaleString(),
      }),
      header: this.transloco.translate('book.browser.confirm.deleteHeader'),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-outlined',
      accept: () => {
        void this.selection.resolvedIds()
          .then(bookIds => this.deleteBooksMutation.mutate({bookIds: [...bookIds]}, {
            onSuccess: result => this.selection.pruneDeleted(result.removedBookIds),
            onError: error => {
              if (error instanceof BulkBookCommandPartialError && 'removedBookIds' in error.completed) {
                this.selection.pruneDeleted(error.completed.removedBookIds);
              }
              this.deleteErrorToast(error);
            },
          }))
          .catch(() => undefined);
      },
    });
  }

  protected onBulkMarkAs(status: ReadStatusTarget): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('browse.bulk.markAsHeader'),
      message: this.transloco.translate('browse.bulk.markAsMessage', {
        count: this.selection.count().toLocaleString(),
        status: READ_STATUS_TARGET_LABELS[status],
      }),
      acceptLabel: this.transloco.translate('common.confirm'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => {
        void this.selection.resolvedIds()
          .then(bookIds => this.readStatusMutation.mutate(
            {bookIds: [...bookIds], status},
            {onError: this.readStatusErrorToast},
          ))
          .catch(() => undefined);
      },
    });
  }

  protected onSelectAllKey(event: Event): void {
    const target = event.target as HTMLElement | null;
    const typing = target !== null && (
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    );
    if (typing || !this.selectionEnabled() || this.total() === null) {
      return;
    }
    event.preventDefault();
    this.selection.selectAll();
  }

  protected onMenuRequested(book: BookSummary, event: MouseEvent): void {
    if (event.type !== 'contextmenu' && this.openMenuBookId() === book.id) {
      this.cardMenu()?.close();
      return;
    }
    this.menuBookSnapshot.set(book);
    this.openMenuBookId.set(book.id);
    this.cardMenu()?.openFromCard(event);
  }

  protected onMenuClosed(): void {
    this.openMenuBookId.set(null);
  }

  protected onToggleShelf(shelf: BookCardMenuShelf, checked: boolean): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    this.shelfMembershipMutation.mutate({
      bookIds: [book.id],
      assignShelfIds: checked ? [shelf.id] : [],
      unassignShelfIds: checked ? [] : [shelf.id],
    }, {onError: this.shelfUpdateErrorToast});
  }

  protected onSetReadStatus(status: BookReadStatus): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    this.readStatusMutation.mutate(
      {bookIds: [book.id], status},
      {onError: this.readStatusErrorToast},
    );
  }

  protected onFetchMetadata(): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    this.refreshMetadataMutation.mutate(
      {target: {kind: 'books', bookIds: [book.id]}},
      {onError: this.metadataRefreshErrorToast},
    );
  }

  protected onFetchMetadataWithOptions(): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    void this.dialogHelper.openMetadataRefreshDialog(new Set([book.id])).catch(() => undefined);
  }

  protected onEditMetadata(): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    this.router.navigate(['/book', book.id], {queryParams: {tab: 'edit'}});
  }

  protected onMetadataLockChange(locked: boolean): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    this.metadataLocksMutation.mutate({bookIds: [book.id], locked}, {
      onError: error => this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('metadata.editor.toast.errorSummary'),
        detail: (error as {error?: {message?: string}})?.error?.message
          || this.transloco.translate('metadata.editor.toast.lockStateFailed'),
      }),
    });
  }

  protected onCreateShelf(): void {
    void this.dialogHelper.openShelfCreatorDialog().catch(() => undefined);
  }

  protected onDownload(): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    this.bookFileService.downloadFile(book as unknown as Book);
  }

  protected onQuickSend(): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    this.emailService.emailBookQuick(book.id).subscribe({
      next: () => this.messageService.add({
        severity: 'success',
        summary: this.transloco.translate('book.card.toast.quickSendSuccessSummary'),
        detail: this.transloco.translate('book.card.toast.quickSendSuccessDetail'),
      }),
      error: (err: {error?: {message?: string}}) => this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('book.card.toast.quickSendErrorSummary'),
        detail: err?.error?.message || this.transloco.translate('book.card.toast.quickSendErrorDetail'),
      }),
    });
  }

  protected onCustomSend(): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    void this.dialogHelper.openCustomSendDialog(book as unknown as Book).catch(() => undefined);
  }

  protected onDeleteRequested(): void {
    const book = this.menuBook();
    if (!book) {
      return;
    }
    this.confirmationService.confirm({
      message: this.transloco.translate('book.card.confirm.deleteBookMessage', {title: book.metadata?.title}),
      header: this.transloco.translate('book.card.confirm.deleteBookHeader'),
      icon: 'pi pi-exclamation-triangle',
      acceptIcon: 'pi pi-trash',
      rejectIcon: 'pi pi-times',
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-outlined',
      accept: () => this.deleteBooksMutation.mutate({bookIds: [book.id]}, {
        onSuccess: result => this.selection.pruneDeleted(result.removedBookIds),
        onError: this.deleteErrorToast,
      }),
    });
  }

  protected onDensityChange(direction: GridDensityDirection): void {
    const facade = this.gridRef()?.densityFacade();
    if (facade) {
      this.gridDensity.adjust(direction, facade);
    }
  }

  protected onFiltersToggle(): void {
    if (this.isMobile()) {
      this.router.navigate(['filter'], {relativeTo: this.route, queryParamsHandling: 'preserve'});
      return;
    }
    const next = !this.railOpen();
    this.railOpen.set(next);
    this.localStorage.set(RAIL_OPEN_STORAGE_KEY, next);
  }

  protected onToggleFacet(toggle: FilterRailToggle): void {
    const next = toggle.origin === 'row' && this.advancedFiltering.enabled()
      ? cycleFacetValue(this.facetSelections(), toggle.key, toggle.value)
      : toggleFacetSelection(this.facetSelections(), toggle.key, toggle.value, toggle.selected);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: browseFacetQueryParams(next),
      queryParamsHandling: 'merge',
    });
  }

  protected onQueryDraftChange(value: string): void {
    this.queryDraft.set(value);
    if (this.queryDebounceTimer != null) {
      clearTimeout(this.queryDebounceTimer);
    }
    this.queryDebounceTimer = setTimeout(() => {
      this.queryDebounceTimer = null;
      const trimmed = this.queryDraft().trim();
      if (trimmed === this.queryText()) {
        return;
      }
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {query: trimmed || null},
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }, QUERY_DEBOUNCE_MS);
  }

  protected onClearQuery(): void {
    if (this.queryDebounceTimer != null) {
      clearTimeout(this.queryDebounceTimer);
      this.queryDebounceTimer = null;
    }
    this.queryDraft.set('');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {query: null},
      queryParamsHandling: 'merge',
    });
  }

  protected onClearAllFilters(): void {
    if (this.queryDebounceTimer != null) {
      clearTimeout(this.queryDebounceTimer);
      this.queryDebounceTimer = null;
    }
    this.queryDraft.set('');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {facet: null, facet_must: null, facet_not: null, query: null},
      queryParamsHandling: 'merge',
    });
  }

  protected onSortChange(selection: BookSortSelection): void {
    this.navigateToSortTerms(sortTerms(selection));
  }

  protected onTableSortChange(terms: readonly BookSortTerm[]): void {
    this.navigateToSortTerms(terms.length > 0 ? terms : sortTerms(DEFAULT_BOOK_SORT));
  }

  protected onTableSortingChange(sorting: SortingState): void {
    const sortableFields = this.sortableFields();
    const terms = sorting.flatMap((item): BookSortTerm[] => {
      return sortableFields.has(item.id)
        ? [{key: item.id, direction: item.desc ? 'desc' : 'asc'}]
        : [];
    });
    this.onTableSortChange(terms);
  }

  private navigateToSortTerms(terms: readonly BookSortTerm[]): void {
    const token = sortTermsToken(terms);
    const isDefault = token === sortToken(DEFAULT_BOOK_SORT);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {sort: isDefault ? null : token},
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onRetryInitial(): void {
    this.retryCurrentWindow();
  }

  protected onRetryNextPage(): void {
    this.retryCurrentWindow();
  }

  private retryCurrentWindow(): void {
    const failedPages = this.currentState().failedPages;
    const snapshots = this.pageQueries().filter(snapshot => failedPages.has(snapshot.pageNumber));
    this.retrySuppressedPages.set(new Set(snapshots.map(snapshot => snapshot.pageNumber)));
    this.windowState.update(current => ({...current, failedPages: new Set()}));
    for (const snapshot of snapshots) {
      void snapshot.refetch();
    }
  }
}
