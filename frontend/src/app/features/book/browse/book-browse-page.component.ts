import {ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, type ParamMap, Router} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {ConfirmationService, MessageService} from 'primeng/api';
import {injectInfiniteQuery, injectMutation, injectQuery, QueryClient} from '@tanstack/angular-query-experimental';
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
  READ_STATUS_TARGET_LABEL_KEYS,
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
import {CoverScalePreferenceService} from '../../../shared/service/cover-scale-preference.service';
import {BookBrowseColumnPreferenceService} from './book-browse-column-preference.service';
import {ShelfDefinitionQueryService} from '../data/shelf-definition-query.service';
import {MagicShelfService} from '../../magic-shelf/service/magic-shelf.service';
import {LibraryService} from '../service/library.service';
import {BookService} from '../service/book.service';
import {
  type EntityViewPreferenceOverride,
  type EntityViewPreferences,
  type SortCriterion,
  UserService,
} from '../../settings/user-management/user.service';
import {type MultiSortDialogResult} from './multi-sort-dialog.component';
import {DialogLauncherService} from '../../../shared/services/dialog-launcher.service';
import {BookDialogHelperService} from '../service/book-dialog-helper.service';
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
  type FacetValueMap,
  normalizeBookPageParams,
} from '../data/book-query-params';
import {bookBrowseScope, scopedFacetSelection} from './book-browse-scope';
import {type BookFacetGroup, flattenBookPages} from '../data/book-query.models';
import {
  browseFacetQueryParams,
  buildRailGroups,
  countFacetSelections,
  facetValuesForKey,
  freezeFacetOrders,
  orderedFacetVocabularyKeys,
  parseFacetParams,
  toggleFacetSelection,
  type FrozenFacetOrders,
} from './book-browse-facets';
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
  type BookSortSelection,
} from './book-browse-sort.config';
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
const PAGE_PREFETCH_THRESHOLD = 12;
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
  protected readonly columnPreferences = inject(BookBrowseColumnPreferenceService);
  private readonly seriesCollapse = inject(SeriesCollapsePreferenceService);
  private readonly sortLine = inject(BookBrowseSortLineService);
  private readonly shelfDefinitionQuery = inject(ShelfDefinitionQueryService);
  private readonly magicShelfService = inject(MagicShelfService);
  private readonly libraryService = inject(LibraryService);
  private readonly bookService = inject(BookService);
  private readonly userService = inject(UserService);
  private readonly dialogLauncher = inject(DialogLauncherService);
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
      facets: this.requestFacets(),
      sort: [],
      query: this.queryText() || undefined,
    }),
    enabled: this.railVisible(),
    placeholderData: (previous: BookFacetGroup[] | undefined) => previous,
  }));
  private readonly unfilteredFacetsQuery = injectQuery(() => ({
    ...this.bookQuery.facets({facets: this.scopeOnlyFacets(), sort: []}),
  }));
  protected readonly serverSortTokens = computed<readonly string[]>(() => {
    const sortGroup = this.unfilteredFacetsQuery.data()?.find(group => group.rel === 'sort');
    const seen = new Set<string>();
    return (sortGroup?.values ?? []).flatMap(link => {
      if (!link.value || seen.has(link.value)) {
        return [];
      }
      seen.add(link.value);
      return [link.value];
    });
  });
  protected readonly sortOptions = computed(() => buildSortOptions(this.serverSortTokens()));
  protected readonly sortableFields = computed<ReadonlySet<string>>(
    () => new Set(this.sortOptions().map(option => option.id)),
  );
  private readonly frozenFacets = computed<FrozenFacetOrders | null>(() => {
    const data = this.unfilteredFacetsQuery.data();
    return data && data.length > 0 ? freezeFacetOrders(data) : null;
  });
  protected readonly railGroups = computed<FilterRailGroup[]>(() =>
    buildRailGroups(
      this.facetsQuery.data() ?? [],
      this.frozenFacets() ?? undefined,
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
    const selectionKeys = Object.keys(selections);
    const keys = [
      ...vocabularyKeys,
      ...selectionKeys.filter((key, index) =>
        !vocabularySet.has(key) && selectionKeys.indexOf(key) === index),
    ];
    return keys.flatMap(key => {
      const values = facetValuesForKey(selections, key);
      if (values.length === 0) {
        return [];
      }
      const frozenGroup = frozen && Object.hasOwn(frozen, key) ? frozen[key] : undefined;
      const frozenIndex = new Map((frozenGroup?.values ?? []).map((item, index) => [item.value, index]));
      return [...values]
        .sort((a, b) => {
          const indexA = frozenIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
          const indexB = frozenIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
          return indexA - indexB || a.localeCompare(b);
        })
        .map(value => ({
          key,
          value,
          groupLabel: frozenGroup?.title ?? key,
          valueLabel: frozenGroup?.values.find(item => item.value === value)?.label ?? value,
        }));
    });
  });

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
  private readonly defaultSortTerms = computed<readonly BookSortTerm[]>(() => {
    const preferences = this.userService.currentUser()?.userSettings?.entityViewPreferences;
    const advertised = this.sortableFields();
    const context = entityViewPreferenceContext(this.routeParamMap());
    const candidates = [
      context
        ? preferences?.overrides?.find(override =>
            override.entityType === context.entityType && override.entityId === context.entityId,
          )?.preferences
        : undefined,
      preferences?.global,
    ];
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const criteria = candidate.sortCriteria?.length
        ? candidate.sortCriteria
        : candidate.sortKey
          ? [{field: candidate.sortKey, direction: candidate.sortDir ?? 'ASC'}]
          : [];
      const terms = criteria
        .filter(criterion => advertised.size === 0 || advertised.has(criterion.field))
        .map(criterion => ({
          key: criterion.field,
          direction: criterion.direction === 'DESC' ? 'desc' as const : 'asc' as const,
        }));
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
    parseFacetParams(this.queryParamMap().getAll('facet')),
  );
  private readonly scope = computed(() =>
    bookBrowseScope(this.routeParamMap(), this.route.snapshot.data),
  );
  protected readonly headerActionType = computed(() => {
    const permissions = this.userService.currentUser()?.permissions;
    if (permissions?.admin !== true && permissions?.canManageLibrary !== true) return null;

    const scope = this.scope();
    switch (scope?.kind) {
      case 'library':
        return this.libraryService.libraries().some(library => library.id === scope.entityId)
          ? scope.kind
          : null;
      case 'shelf':
        return (this.shelfDefinitionsQuery.data() ?? []).some(shelf => shelf.id === scope.entityId)
          ? scope.kind
          : null;
      case 'magicShelf':
        return this.magicShelfService.shelves().some(shelf => shelf.id === scope.entityId)
          ? scope.kind
          : null;
      default:
        return null;
    }
  });
  protected readonly headerActionId = computed(() => {
    const scope = this.scope();
    return this.headerActionType() !== null && scope && scope.kind !== 'unshelved'
      ? scope.entityId
      : null;
  });
  private readonly requestFacets = computed<FacetValueMap>(() =>
    scopedFacetSelection(this.facetSelections(), this.scope()),
  );
  private readonly scopeOnlyFacets = computed<FacetValueMap>(() =>
    scopedFacetSelection(EMPTY_FACET_SELECTION, this.scope()),
  );
  protected readonly filterCount = computed(() => countFacetSelections(this.facetSelections()));
  protected readonly queryText = computed(() => (this.queryParamMap().get('query') ?? '').trim());
  protected readonly queryDraft = signal(this.route.snapshot.queryParamMap.get('query') ?? '');
  private queryDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly activeFilterCount = computed(() => this.filterCount() + (this.queryText() ? 1 : 0));
  private readonly params = computed<BookPageParams>(() => ({
    ...BROWSE_PAGE_PARAMS,
    facets: this.requestFacets(),
    sort: this.activeSortTerms(),
    query: this.queryText() || undefined,
  }));
  private readonly normalizedParams = computed(() => normalizeBookPageParams(this.params()));
  private readonly paramsKey = computed(() => JSON.stringify(this.normalizedParams()));
  private readonly booksQuery = injectInfiniteQuery(() => this.bookQuery.infinitePage(this.params()));
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly books = computed<readonly BookSummary[]>(() => {
    const books = flattenBookPages(this.booksQuery.data());
    const overlay = this.pendingBookOverlay();
    if (overlay.readStatuses.size === 0
      && overlay.shelfMembership.size === 0
      && overlay.metadataLocks.size === 0) {
      return books;
    }
    return books.map(book => overlayPendingBookState(book, overlay));
  });
  protected readonly total = computed<number | null>(() =>
    this.booksQuery.data()?.pages[0]?.page.totalElements ?? null,
  );
  protected readonly status = computed<BrowseGridStatus>(() => {
    if (this.books().length > 0 || this.booksQuery.isSuccess()) {
      return 'success';
    }
    return this.booksQuery.isError() ? 'error' : 'pending';
  });
  protected readonly nextPageError = computed(() =>
    this.books().length > 0 && this.booksQuery.isFetchNextPageError(),
  );
  protected readonly hasNextPage = this.booksQuery.hasNextPage;

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
  protected readonly bookItemKey = (book: BookSummary): number => book.id;

  private readonly scopeTitle = computed<string | null>(() => {
    this.activeLang();
    const scope = this.scope();
    switch (scope?.kind) {
      case 'library':
        return this.libraryService.libraries().find(library => library.id === scope.entityId)?.name ?? null;
      case 'shelf':
        return (this.shelfDefinitionsQuery.data() ?? [])
          .find(shelf => shelf.id === scope.entityId)?.name ?? null;
      case 'magicShelf':
        return this.magicShelfService.shelves()
          .find(shelf => shelf.id === scope.entityId)?.name ?? null;
      case 'unshelved':
        return this.transloco.translate('book.browser.labels.unshelvedBooks');
      default:
        return null;
    }
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
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
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

    let lastParamsKey: string | null = null;
    effect(() => {
      const key = this.paramsKey();
      if (lastParamsKey !== null && key !== lastParamsKey) {
        untracked(() => {
          this.tableRef()?.scrollToTop();
          this.gridRef()?.scrollToTop();
        });
      }
      lastParamsKey = key;
    });

    effect(() => {
      const title = this.pageHeader().title;
      if (title) {
        this.pageTitle.setPageTitle(title);
      }
    });
  }

  protected onVisibleRange(range: BrowseVisibleRange): void {
    if (
      range.end >= this.books().length - PAGE_PREFETCH_THRESHOLD &&
      this.booksQuery.hasNextPage() &&
      !this.booksQuery.isFetching()
    ) {
      void this.booksQuery.fetchNextPage({cancelRefetch: false});
    }
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

  protected isTableRowSelected = (book: BookSummary): boolean =>
    this.selection.isSelected(book.id);

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

  protected statusLabelKey(status: ReadStatusTarget): string {
    return READ_STATUS_TARGET_LABEL_KEYS[status];
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
      header: this.transloco.translate('book.menuService.menu.updateReadStatus'),
      message: this.transloco.translate('browse.bulk.markAsMessage', {
        count: this.selection.count().toLocaleString(),
        status: this.transloco.translate(READ_STATUS_TARGET_LABEL_KEYS[status]),
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
    const next = toggleFacetSelection(this.facetSelections(), toggle.key, toggle.value, toggle.selected);
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
    });
    ref?.onClose.pipe(take(1)).subscribe((result?: MultiSortDialogResult) => {
      if (!result) {
        return;
      }
      this.onTableSortChange(result.terms);
      if (result.saveAsDefault) {
        this.saveSortDefault(result.terms);
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
    const sortFields = {
      sortKey: sortCriteria[0]?.field ?? 'title',
      sortDir: sortCriteria[0]?.direction ?? 'ASC' as const,
      sortCriteria,
    };
    const prefs: EntityViewPreferences = structuredClone(
      user.userSettings.entityViewPreferences ?? {
        global: {sortKey: 'title', sortDir: 'ASC', view: 'GRID', coverSize: 1.0, seriesCollapsed: false, overlayBookType: true},
        overrides: [],
      },
    );
    const context = entityViewPreferenceContext(this.routeParamMap());
    if (context === null) {
      prefs.global = {...prefs.global, ...sortFields};
    } else {
      prefs.overrides ??= [];
      const existing = prefs.overrides.find(override =>
        override.entityType === context.entityType && override.entityId === context.entityId);
      if (existing) {
        existing.preferences = {...existing.preferences, ...sortFields};
      } else {
        prefs.overrides.push({
          ...context,
          preferences: {...sortFields, view: 'GRID', coverSize: 1.0, seriesCollapsed: false, overlayBookType: true},
        });
      }
    }
    this.userService.updateUserSetting(user.id, 'entityViewPreferences', prefs);
  }

  protected onTableSortChange(terms: readonly BookSortTerm[]): void {
    this.navigateToSortTerms(terms.length > 0 ? terms : sortTerms(DEFAULT_BOOK_SORT));
  }

  protected onTableSortingChange(sorting: SortingState): void {
    const options = new Map(this.sortOptions().map(option => [option.id, option]));
    const terms = sorting.flatMap((item): BookSortTerm[] => {
      const direction = item.desc ? 'desc' : 'asc';
      return options.get(item.id)?.directions.includes(direction)
        ? [{key: item.id, direction}]
        : [];
    });
    this.onTableSortChange(terms);
  }

  private navigateToSortTerms(terms: readonly BookSortTerm[]): void {
    const token = sortTermsToken(terms);
    const isDefault = token === sortTermsToken(this.defaultSortTerms());
    const collapsesMultiSort = this.activeSortTerms().length > 1 && terms.length === 1;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {sort: isDefault ? null : token},
      queryParamsHandling: 'merge',
      replaceUrl: !collapsesMultiSort,
    });
  }

  protected onRetryInitial(): void {
    if (!this.booksQuery.isFetching()) {
      void this.booksQuery.refetch({cancelRefetch: false});
    }
  }

  protected onRetryNextPage(): void {
    if (
      this.booksQuery.isFetchNextPageError() &&
      this.booksQuery.hasNextPage() &&
      !this.booksQuery.isFetching()
    ) {
      void this.booksQuery.fetchNextPage({cancelRefetch: false});
    }
  }

}
