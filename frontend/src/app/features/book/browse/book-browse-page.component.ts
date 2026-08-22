import {ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {injectInfiniteQuery, injectQuery, keepPreviousData, QueryClient} from '@tanstack/angular-query-experimental';
import {type SortingState} from '@tanstack/angular-table';
import {take} from 'rxjs/operators';

import {BrowseGridComponent} from '../../../shared/components/browse/browse-grid/browse-grid.component';
import {
  BrowseGridEmptyDef,
  BrowseGridItemDef,
  BrowseGridSkeletonDef,
} from '../../../shared/components/browse/browse-grid/browse-grid.directives';
import {type BrowseGridRenderedRange} from '../../../shared/components/browse/browse-grid/browse-grid-viewport.component';
import {bookCardHeightForWidth} from '../components/cards/book-card.layout';
import {BookCardComponent, bookCardCoverSrc} from '../components/cards/book-card.component';
import {UrlHelperService} from '../../../shared/service/url-helper.service';
import {BookMenuComponent} from '../components/book-menu/book-menu.component';
import {BookCardSkeletonComponent} from '../components/cards/book-card-skeleton.component';
import {ArtworkRevealGroupDirective} from '../../../shared/components/cover/artwork-reveal-group.directive';
import {AppPageHeaderComponent} from '../../../shared/layout/page-header/app.page-header.component';
import {type PageHeader} from '../../../shared/layout/page-header/page-header.service';
import {LayoutService} from '../../../shared/layout/layout.service';
import {LocalStorageService} from '../../../shared/service/local-storage.service';
import {PageTitleService} from '../../../shared/service/page-title.service';
import {createGridDensity} from '../../../shared/util/grid-density.util';
import {type ContextMenuRequest} from '../../../shared/ui/menu/app-menu.component';
import {normalizeRemoteSearchTerm} from '../../../shared/util/search-terms';
import {type GridDensityDirection} from '../../../shared/components/grid-density-buttons/grid-density-buttons.component';
import {CoverScalePreferenceService} from '../../../shared/service/cover-scale-preference.service';
import {ShelfDefinitionQueryService} from '../data/shelf-definition-query.service';
import {MagicShelfService} from '../../magic-shelf/service/magic-shelf.service';
import {LibraryService} from '../service/library.service';
import {BookNavigationService} from '../service/book-navigation.service';
import {
  type EntityViewPreference,
  type SortCriterion,
  type TableColumnPreference,
  UserService,
} from '../../settings/user-management/user.service';
import {
  entityViewPreferenceContext,
  findEntityViewPreferenceOverride,
  resolveEntityViewPreference,
  upsertEntityViewPreference,
} from '../../settings/user-management/entity-view-preferences';
import {type MultiSortDialogResult} from '../../../shared/components/browse/multi-sort-dialog.component';
import {DialogLauncherService} from '../../../shared/services/dialog-launcher.service';
import {
  browseFacetQueryParams,
  countFacetSelections,
  EMPTY_FACET_SELECTION,
  type BookPageParams,
  type BookQuerySortKey,
  type BookSortTerm,
  type FacetValueMap,
  type BookQueryFacetKey,
  isBookQuerySortKey,
  parseFacetParams,
  parseSortTermsToken,
  sortTermsToken,
  toggleFacetSelection,
} from '../data/book-query-params';
import {bookBrowseCollection} from './book-browse-collection';
import {bookBrowseScope, bookBrowseScopeTitle, scopedFacetSelection} from './book-browse-scope';
import {type BookFacetResult} from '../data/book-query.models';
import {
  bookBrowseColumnOptions,
  bookBrowseSortFieldResolver,
  bookBrowseSortLineAvailable,
  bookBrowseSortableColumnFields,
  bookBrowseVisibleColumnOptions,
  buildBookFilterChips,
  buildRailGroups,
  buildSortOptions,
  DEFAULT_BOOK_SORT,
  freezeFacetOrders,
  normalizeBookBrowseColumnPreferences,
  parseSortToken,
  sortTerms,
  type FrozenFacetOrders,
  type BookSortSelection,
} from './book-browse-fields';
import {BookBrowseSortLineService} from './book-browse-sort-line.service';
import {cn} from '../../../shared/ui/cn';
import {AppButtonComponent} from '../../../shared/ui/button/app-button.component';
import {AppInputComponent} from '../../../shared/ui/input/app-input.component';
import {LucideSearch, LucideX} from '@lucide/angular';
import {
  BrowseFilterRailComponent,
  type FilterRailGroup,
  type FilterRailToggle,
} from '../../../shared/components/browse/browse-filter-rail/browse-filter-rail.component';
import {BookBrowseToolbarComponent} from './book-browse-toolbar.component';
import {BookBrowseBulkBarComponent} from './book-browse-bulk-bar.component';
import {BookQueryService} from '../data/book-query.service';
import {type BookSummary} from '../data/book-response.models';
import {
  injectPendingBookDeletions,
  injectPendingBookProgressResets,
  injectPendingBookReadStatuses,
  overlayPendingBookState,
  type PendingBookOverlay,
} from '../data/book-command-pending-state';
import {createBrowseSelection} from '../../../shared/components/browse/browse-selection';
import {createBrowsePresentation, heldSignal} from '../../../shared/components/browse/browse-presentation';
import {createBrowseSearchDraft} from '../../../shared/components/browse/browse-search-draft';
import {installBrowseSelectionShortcuts} from '../../../shared/components/browse/browse-selection-shortcuts';
import {
  BrowseFilterChipsComponent,
  type BrowseFilterChip,
} from '../../../shared/components/browse/browse-filter-chips.component';
import {
  BookBrowseTableComponent,
  type BookBrowseTableFacetRequest,
  type BookBrowseTableSelection,
} from './book-browse-table.component';
import {type BookBrowseViewMode} from './book-browse.models';
import {type LibraryShelfMenuTarget} from '../components/library-shelf-menu/library-shelf-menu.component';

const PAGE_SIZE = 60;

interface BrowseChipsBand {
  count: number;
  query: string;
  chips: readonly BrowseFilterChip<BookQueryFacetKey>[];
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
  facetLogic: 'or',
};

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
    BookMenuComponent,
    BookCardSkeletonComponent,
    ArtworkRevealGroupDirective,
    BookBrowseToolbarComponent,
    BookBrowseTableComponent,
    BookBrowseBulkBarComponent,
    BrowseFilterRailComponent,
    BrowseFilterChipsComponent,
    AppButtonComponent,
    AppInputComponent,
    LucideSearch,
    LucideX,
  ],
  templateUrl: './book-browse-page.component.html',
})
export class BookBrowsePageComponent {
  private readonly bookQuery = inject(BookQueryService);
  private readonly queryClient = inject(QueryClient);
  private readonly transloco = inject(TranslocoService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly layout = inject(LayoutService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly coverScale = inject(CoverScalePreferenceService);
  private readonly sortLine = inject(BookBrowseSortLineService);
  private readonly shelfDefinitionQuery = inject(ShelfDefinitionQueryService);
  private readonly magicShelfService = inject(MagicShelfService);
  private readonly libraryService = inject(LibraryService);
  private readonly bookNavigation = inject(BookNavigationService);
  private readonly userService = inject(UserService);
  private readonly urlHelper = inject(UrlHelperService);
  private readonly dialogLauncher = inject(DialogLauncherService);
  private readonly pendingReadStatuses = injectPendingBookReadStatuses();
  private readonly pendingProgressResets = injectPendingBookProgressResets();
  protected readonly pendingDeletions = injectPendingBookDeletions();
  private readonly tableColumnPreferences = linkedSignal<TableColumnPreference[]>(() =>
    normalizeBookBrowseColumnPreferences(
      this.userService.currentUser()?.userSettings.tableColumnPreference,
    ),
  );

  private readonly shelfDefinitionsQuery = injectQuery(() => this.shelfDefinitionQuery.definitions());
  private readonly pendingBookOverlay = computed<PendingBookOverlay>(() => ({
    readStatuses: this.pendingReadStatuses(),
    progressResets: this.pendingProgressResets(),
  }));

  private readonly gridRef = viewChild(BrowseGridComponent);
  private readonly tableRef = viewChild(BookBrowseTableComponent);
  private readonly bookMenu = viewChild(BookMenuComponent);
  protected readonly isMobile = computed(() => !this.layout.isDesktop());
  protected readonly mobileSelectMode = signal(false);
  private readonly screenWidth = signal(window.innerWidth);
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
  protected readonly formatPill = computed(() =>
    this.userService.currentUser()?.userSettings.entityViewPreferences?.global?.overlayBookType ?? true);

  private readonly railOpen = signal(this.localStorage.get<boolean>(RAIL_OPEN_STORAGE_KEY) === true);
  protected readonly railVisible = computed(() => !this.isMobile() && this.railOpen());
  protected readonly filtersOpen = this.railOpen.asReadonly();
  private readonly unfilteredFacetsQuery = injectQuery(() => ({
    ...this.bookQuery.facets({facets: this.scopeOnlyFacets(), facetLogic: 'or'}),
  }));
  protected readonly serverSortTokens = computed<readonly string[]>(() =>
    this.unfilteredFacetsQuery.data()?.sortTokens ?? []);
  protected readonly sortOptions = computed(() => buildSortOptions(this.serverSortTokens()));
  private readonly availableSortKeys = computed<ReadonlySet<BookQuerySortKey>>(
    () => new Set(this.sortOptions().map(option => option.id)),
  );
  protected readonly sortableFields = computed(() =>
    bookBrowseSortableColumnFields(this.sortOptions()));
  private readonly frozenFacets = computed<FrozenFacetOrders | null>(() => {
    const data = this.unfilteredFacetsQuery.data();
    return data ? freezeFacetOrders(data.facets) : null;
  });
  protected readonly railGroups = computed<FilterRailGroup<BookQueryFacetKey>[]>(() =>
    buildRailGroups(
      this.facetsQuery.data()?.facets ?? [],
      this.frozenFacets() ?? undefined,
    ),
  );
  private readonly headerRef = viewChild(AppPageHeaderComponent);
  protected readonly chipsBandClass = computed(() =>
    cn(
      'sticky top-[var(--page-stuck-offset)] z-10 -mx-4 bg-page px-4',
      this.isMobile() ? 'pb-1.5' : 'pb-3',
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
  protected readonly filterChips = computed(() =>
    buildBookFilterChips(
      this.facetSelections(),
      this.unfilteredFacetsQuery.data()?.facets ?? [],
      this.frozenFacets() ?? undefined,
    ));

  protected readonly menuOpenBookId = computed(() => this.bookMenu()?.openBookId() ?? null);

  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly routeParamMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly activeViewPreference = computed<EntityViewPreference | undefined>(() =>
    resolveEntityViewPreference(
      this.userService.currentUser()?.userSettings.entityViewPreferences,
      entityViewPreferenceContext(this.routeParamMap()),
    ));
  private readonly defaultSortTerms = computed<readonly BookSortTerm[]>(() => {
    const preferences = this.userService.currentUser()?.userSettings.entityViewPreferences;
    const available = this.availableSortKeys();
    const context = entityViewPreferenceContext(this.routeParamMap());
    const candidates = [
      context ? findEntityViewPreferenceOverride(preferences, context) : undefined,
      preferences?.global,
    ];
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const criteria = candidate.sortCriteria?.length
        ? candidate.sortCriteria
        : candidate.sortKey
          ? [{field: candidate.sortKey, direction: candidate.sortDir}]
          : [];
      const terms = criteria.flatMap((criterion): BookSortTerm[] => {
        if (!isBookQuerySortKey(criterion.field)
          || (available.size > 0 && !available.has(criterion.field))) {
          return [];
        }
        return [{
          key: criterion.field,
          direction: criterion.direction === 'DESC' ? 'desc' as const : 'asc' as const,
        }];
      });
      if (terms.length > 0) {
        return terms;
      }
    }
    return sortTerms(DEFAULT_BOOK_SORT);
  });
  protected readonly activeSortTerms = computed<readonly BookSortTerm[]>(() => {
    const terms = parseSortTermsToken(this.queryParamMap().get('sort'));
    return terms.length > 0 ? terms : this.defaultSortTerms();
  });
  protected readonly activeSort = computed<BookSortSelection>(() => {
    const parsed = parseSortToken(sortTermsToken(this.activeSortTerms())) ?? DEFAULT_BOOK_SORT;
    const advertised = this.sortOptions().find(option => option.id === parsed.option.id);
    return advertised?.directions.includes(parsed.direction)
      ? {option: advertised, direction: parsed.direction}
      : parsed;
  });
  protected readonly viewMode = computed<BookBrowseViewMode>(() => {
    const requestedView = this.queryParamMap().get('view');
    if (requestedView === 'grid' || requestedView === 'table') {
      return requestedView;
    }
    return this.activeViewPreference()?.view === 'TABLE'
      ? 'table'
      : 'grid';
  });
  protected readonly mobileTableLayout = computed(
    () => this.isMobile() && this.viewMode() === 'table',
  );
  protected readonly visibleTableColumns = computed(() => {
    this.activeLang();
    return bookBrowseVisibleColumnOptions(this.tableColumnPreferences()).map(column => ({
      field: column.field,
      header: this.transloco.translate(column.labelKey),
    }));
  });
  protected readonly tableColumnOptions = computed(() =>
    bookBrowseColumnOptions(this.tableColumnPreferences()));
  protected readonly tableSorting = computed<SortingState>(() =>
    this.activeSortTerms().map(term => ({id: term.key, desc: term.direction === 'desc'})),
  );
  private readonly facetSelections = computed(() =>
    parseFacetParams(this.queryParamMap().getAll('facet')),
  );
  private readonly scope = computed(() =>
    bookBrowseScope(this.routeParamMap(), this.route.snapshot.data),
  );
  protected readonly headerActionTarget = computed<LibraryShelfMenuTarget | null>(() => {
    const scope = this.scope();
    switch (scope?.kind) {
      case 'library': {
        const entity = this.libraryService.libraries()
          .find(library => library.id === scope.entityId);
        return entity?.id == null
          ? null
          : {type: 'library', entity: {...entity, id: entity.id}};
      }
      case 'shelf': {
        const entity = (this.shelfDefinitionsQuery.data() ?? [])
          .find(shelf => shelf.id === scope.entityId);
        return entity
          ? {
              type: 'shelf',
              entity: {
                id: entity.id,
                name: entity.name,
                userId: entity.userId,
                publicShelf: entity.publicShelf,
                bookCount: entity.bookCount,
              },
            }
          : null;
      }
      case 'magicShelf': {
        const entity = this.magicShelfService.shelves()
          .find(shelf => shelf.id === scope.entityId);
        return entity?.id == null
          ? null
          : {type: 'magicShelf', entity: {...entity, id: entity.id}};
      }
      case 'unshelved':
      case undefined:
        return null;
    }
  });
  private readonly requestFacets = computed<FacetValueMap>(() =>
    scopedFacetSelection(this.facetSelections(), this.scope()),
  );
  private readonly scopeOnlyFacets = computed<FacetValueMap>(() =>
    scopedFacetSelection(EMPTY_FACET_SELECTION, this.scope()),
  );
  protected readonly filterCount = computed(() => countFacetSelections(this.facetSelections()));
  protected readonly queryText = computed(() => (this.queryParamMap().get('query') ?? '').trim());
  private readonly searchDraft = createBrowseSearchDraft({
    initial: this.route.snapshot.queryParamMap.get('query') ?? '',
    committed: this.queryText,
    commit: term => {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {query: term || null},
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    },
  });
  protected readonly queryDraft = this.searchDraft.value;
  protected readonly activeFilterCount = computed(() => this.filterCount() + (this.queryText() ? 1 : 0));
  private readonly params = computed<BookPageParams>(() => ({
    ...BROWSE_PAGE_PARAMS,
    facets: this.requestFacets(),
    sort: this.activeSortTerms(),
    query: normalizeRemoteSearchTerm(this.queryText()) || undefined,
  }));
  private readonly collection = computed(() => bookBrowseCollection(this.bookQuery, this.params()));
  private readonly facetsQuery = injectQuery(() => ({
    ...this.collection().facets(),
    enabled: this.railVisible(),
    placeholderData: (previous: BookFacetResult | undefined) => previous,
  }));
  protected readonly railReady = computed(() => this.railVisible() && !this.facetsQuery.isPending());
  private readonly membershipIdentity = computed(() => this.collection().membershipIdentity);
  private readonly orderingIdentity = computed(() => this.collection().orderingIdentity);
  private readonly booksQuery = injectInfiniteQuery(() => ({
    ...this.collection().infinitePage(this.params().size),
    placeholderData: keepPreviousData,
  }));
  private readonly presentation = createBrowsePresentation<BookSummary>({
    query: this.booksQuery,
    orderingIdentity: this.orderingIdentity,
    artworkUrls: (books, lastVisibleIndex) => {
      const square = this.squareCoversFor(books);
      return books.slice(0, lastVisibleIndex + 1).flatMap(book => {
        const url = bookCardCoverSrc(book, square, this.urlHelper);
        return url ? [url] : [];
      });
    },
    scrollToTop: () => {
      this.tableRef()?.scrollToTop();
      this.gridRef()?.scrollToTop();
    },
  });
  protected readonly chipsBand = heldSignal<BrowseChipsBand>(
    () => ({count: this.activeFilterCount(), query: this.queryText(), chips: this.filterChips()}),
    this.presentation.holding,
  );
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly books = computed<readonly BookSummary[]>(() => {
    const books = this.presentation.items();
    const overlay = this.pendingBookOverlay();
    if (overlay.readStatuses.size === 0
      && overlay.progressResets.size === 0) {
      return books;
    }
    return books.map(book => overlayPendingBookState(book, overlay));
  });
  protected readonly total = this.presentation.total;
  protected readonly status = this.presentation.status;
  protected readonly nextPageError = this.presentation.nextPageError;
  protected readonly hasNextPage = this.presentation.hasNextPage;

  protected readonly selection = createBrowseSelection({
    membershipIdentity: this.membershipIdentity,
    orderingIdentity: this.orderingIdentity,
    items: this.books,
    totalElements: this.total,
  });
  protected readonly selectionEnabled = computed(() => !this.isMobile() || this.mobileSelectMode());
  protected readonly allBooksSelected = this.selection.allCurrentResultsSelected;
  protected readonly someBooksSelected = computed(() =>
    this.selection.count() > 0 && !this.allBooksSelected(),
  );
  protected readonly tableSelection = computed<BookBrowseTableSelection>(() => {
    if (!this.selectionEnabled()) {
      return {mode: 'none'};
    }
    return {
      mode: this.selection.active() || this.mobileSelectMode() ? 'active' : 'available',
      allSelected: this.allBooksSelected(),
      someSelected: this.someBooksSelected(),
      isSelected: book => this.selection.isSelected(book.id),
    };
  });
  protected readonly resolveSelectedIds = (): Promise<readonly number[]> =>
    this.queryClient.fetchQuery(this.collection().ids());

  private readonly liveDetailLineKey = computed<BookQuerySortKey | null>(() => {
    const activeSort = sortTermsToken(this.activeSortTerms());
    const defaultSort = sortTermsToken(this.defaultSortTerms());
    if (activeSort !== defaultSort) {
      const key = this.activeSort().option.id;
      if (bookBrowseSortLineAvailable(key)) {
        return key;
      }
    }
    return null;
  });

  private readonly detailLineKey = heldSignal<BookQuerySortKey | null>(
    () => this.liveDetailLineKey(), this.presentation.holding,
  );

  protected detailLineFor(book: BookSummary): string | null {
    const key = this.detailLineKey();
    return key === null ? null : this.sortLine.lineFor(key, book);
  }

  protected readonly squareCovers = computed(() => this.squareCoversFor(this.books()));

  private squareCoversFor(books: readonly BookSummary[]): boolean {
    const scope = this.scope();
    if (scope?.kind === 'library') {
      const formats = this.libraryService.libraries()
        .find(library => library.id === scope.entityId)?.allowedFormats;
      if (formats?.length === 1 && formats[0] === 'AUDIOBOOK') {
        return true;
      }
    }
    return books.length > 0
      && books.every(book => book.primaryFile?.bookType === 'AUDIOBOOK');
  }

  protected readonly metaLines = computed<2 | 3>(() => this.detailLineKey() === null ? 2 : 3);

  protected readonly estimateItemHeight = (width: number): number =>
    bookCardHeightForWidth(width, {square: this.squareCovers(), metaLines: this.metaLines()});
  protected readonly bookItemKey = (book: BookSummary): number => book.id;

  private readonly scopeTitle = computed<string | null>(() => {
    this.activeLang();
    return bookBrowseScopeTitle(
      this.scope(),
      this.libraryService.libraries(),
      this.shelfDefinitionsQuery.data() ?? [],
      this.magicShelfService.shelves(),
      this.transloco.translate('book.browser.labels.unshelvedBooks'),
    );
  });

  protected readonly pageHeader = computed<PageHeader>(() => {
    this.activeLang();
    const total = this.total();
    const title = this.scope()
      ? this.scopeTitle() ?? ''
      : this.transloco.translate('book.browser.labels.allBooks');
    return {
      title,
      count: total == null ? undefined : total.toLocaleString(),
    };
  });

  protected readonly searchHint = computed(() =>
    this.transloco.translate('browse.rail.search', {scope: this.pageHeader().title}),
  );

  constructor() {
    effect(() => {
      if (!this.isMobile() && untracked(this.mobileSelectMode)) {
        untracked(() => this.mobileSelectMode.set(false));
      }
    });

    effect(() => {
      const title = this.pageHeader().title;
      if (title) {
        this.pageTitle.setPageTitle(title);
      }
    });

    installBrowseSelectionShortcuts({
      enabled: () => this.selectionEnabled(),
      active: () => this.selection.active(),
      suspended: () => this.menuOpenBookId() !== null,
      clear: () => this.selection.clear(),
      selectAll: () => this.selection.selectAll(),
      exemptSelector:
        'app-book-card, app-bulk-actions-bar, app-menu, app-page-header, aside, ' +
        'app-book-browse-table, ' +
        '.cdk-overlay-container, .p-dialog-mask, [role="dialog"], ' +
        'button, a, input, textarea, select, label',
      onEscapeWhileInactive: () => {
        if (this.mobileSelectMode()) {
          this.mobileSelectMode.set(false);
        }
      },
    });
  }

  protected onRenderedRange(range: BrowseGridRenderedRange): void {
    this.presentation.onRenderedRange(range);
  }

  protected onViewModeChange(view: BookBrowseViewMode): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {view},
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onTableColumnVisibilityChange(change: {field: string; visible: boolean}): void {
    const column = this.tableColumnOptions().find(option => option.field === change.field);
    if (!column?.hideable) {
      return;
    }
    this.tableColumnPreferences.update(preferences => preferences.map(preference =>
      preference.field === change.field
        ? {...preference, visible: change.visible}
        : preference,
    ));
    const user = this.userService.getCurrentUser();
    if (user) {
      this.userService.updateUserSetting(
        user.id,
        'tableColumnPreference',
        this.tableColumnPreferences(),
      );
    }
  }

  protected onTableColumnsReset(): void {
    this.tableColumnPreferences.set(normalizeBookBrowseColumnPreferences(undefined));
    const user = this.userService.getCurrentUser();
    if (user) {
      this.userService.updateUserSetting(
        user.id,
        'tableColumnPreference',
        this.tableColumnPreferences(),
      );
    }
  }

  protected onMobileSelectToggle(): void {
    if (this.mobileSelectMode()) {
      this.selection.clear();
      this.mobileSelectMode.set(false);
      return;
    }
    this.mobileSelectMode.set(true);
  }

  protected onTableFacetRequested(request: BookBrowseTableFacetRequest): void {
    this.onToggleFacet({...request, selected: true});
  }

  protected onCardAction(book: BookSummary): void {
    this.bookNavigation.readBook(book);
  }

  protected onBookDetailRequested(book: BookSummary): void {
    this.bookNavigation.openBook(book.id, this.books().map(presented => presented.id));
  }

  protected onToggleSelect(book: BookSummary, index: number, shiftKey: boolean): void {
    this.selection.toggle(book, index, shiftKey);
  }

  protected onTableSelectionChange(change: {
    book: BookSummary;
    index: number;
    checked: boolean;
    shiftKey: boolean;
  }): void {
    if (change.checked !== this.selection.isSelected(change.book.id) || change.shiftKey) {
      this.selection.toggle(change.book, change.index, change.shiftKey);
    }
  }

  protected onMenuRequested(book: BookSummary, request: ContextMenuRequest): void {
    this.bookMenu()?.openFor(book, request);
  }

  protected onDensityChange(direction: GridDensityDirection): void {
    const facade = this.gridRef()?.densityFacade();
    if (facade) {
      this.gridDensity.adjust(direction, facade);
    }
  }

  protected onFiltersToggle(): void {
    if (this.isMobile()) {
      void this.router.navigate(['filter'], {relativeTo: this.route, queryParamsHandling: 'preserve'});
      return;
    }
    const next = !this.railOpen();
    this.railOpen.set(next);
    this.localStorage.set(RAIL_OPEN_STORAGE_KEY, next);
  }

  protected onToggleFacet(toggle: FilterRailToggle<BookQueryFacetKey>): void {
    const next = toggleFacetSelection(
      this.facetSelections(),
      toggle.key,
      toggle.value,
      toggle.selected,
    );
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: browseFacetQueryParams(next),
      queryParamsHandling: 'merge',
    });
  }

  protected onQueryDraftChange(value: string): void {
    this.searchDraft.set(value);
  }

  protected onClearQuery(): void {
    this.searchDraft.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {query: null},
      queryParamsHandling: 'merge',
    });
  }

  protected onClearAllFilters(): void {
    this.searchDraft.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {facet: null, query: null},
      queryParamsHandling: 'merge',
    });
  }

  protected onSortChange(selection: BookSortSelection): void {
    this.navigateToSortTerms(sortTerms(selection));
  }

  protected onSortDirectionChange(selection: BookSortSelection): void {
    this.navigateToSortTerms([...sortTerms(selection), ...this.activeSortTerms().slice(1)]);
  }

  protected async onMultiSortRequested(): Promise<void> {
    const ref = await this.dialogLauncher.openMultiSortDialog({
      terms: this.activeSortTerms(),
      options: this.sortOptions(),
      saveDefaultLabelKey: 'book.sorting.saveAsDefault',
      resolveField: bookBrowseSortFieldResolver,
    });
    ref?.onClose.pipe(take(1)).subscribe((result?: MultiSortDialogResult) => {
      if (!result) {
        return;
      }
      const terms = result.terms.flatMap((term): BookSortTerm[] =>
        isBookQuerySortKey(term.key) ? [{key: term.key, direction: term.direction}] : []);
      this.onTableSortChange(terms);
      if (result.saveAsDefault) {
        this.saveSortDefault(terms);
      }
    });
  }

  private saveSortDefault(terms: readonly BookSortTerm[]): void {
    const user = this.userService.currentUser();
    if (!user) {
      return;
    }
    const sortCriteria: SortCriterion[] = terms.map(term => ({
      field: term.key,
      direction: term.direction === 'asc' ? 'ASC' as const : 'DESC' as const,
    }));
    const prefs = upsertEntityViewPreference(
      user.userSettings.entityViewPreferences,
      entityViewPreferenceContext(this.routeParamMap()),
      {
        sortKey: sortCriteria[0]?.field ?? 'title',
        sortDir: sortCriteria[0]?.direction ?? 'ASC' as const,
        sortCriteria,
      },
    );
    this.userService.updateUserSetting(user.id, 'entityViewPreferences', prefs);
  }

  protected onTableSortChange(terms: readonly BookSortTerm[]): void {
    this.navigateToSortTerms(terms.length > 0 ? terms : sortTerms(DEFAULT_BOOK_SORT));
  }

  protected onTableSortingChange(sorting: SortingState): void {
    const options = new Map(this.sortOptions().map(option => [option.id, option]));
    const terms = sorting.flatMap((item): BookSortTerm[] => {
      const direction = item.desc ? 'desc' : 'asc';
      return isBookQuerySortKey(item.id) && options.get(item.id)?.directions.includes(direction)
        ? [{key: item.id, direction}]
        : [];
    });
    this.onTableSortChange(terms);
  }

  private navigateToSortTerms(terms: readonly BookSortTerm[]): void {
    const token = sortTermsToken(terms);
    const isDefault = token === sortTermsToken(this.defaultSortTerms());
    const collapsesMultiSort = this.activeSortTerms().length > 1 && terms.length === 1;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {sort: isDefault ? null : token},
      queryParamsHandling: 'merge',
      replaceUrl: !collapsesMultiSort,
    });
  }

  protected onRetryInitial(): void {
    this.presentation.retryInitial();
  }

  protected onRetryNextPage(): void {
    this.presentation.retryNextPage();
  }

}
