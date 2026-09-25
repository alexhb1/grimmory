import {computed, inject, Injector, signal, type Signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {TranslocoService} from '@jsverse/transloco';
import {injectQuery} from '@tanstack/angular-query-experimental';

import {debouncedSignal} from '../../../shared/util/debounced-signal';
import {normalizeRemoteSearchTerm, SEARCH_DEBOUNCE_MS} from '../../../shared/util/search-terms';
import {MagicShelfService} from '../../magic-shelf/service/magic-shelf.service';
import {
  EMPTY_FACET_SELECTION,
  type BookCollectionFilterParams,
  type BookQueryFacetKey,
  type FacetValueMap,
} from '../data/book-query-params';
import {type BrowseFacetGroup} from '../../../core/data/browse.models';
import {BookQueryService} from '../data/book-query.service';
import {ShelfDefinitionQueryService} from '../data/shelf-definition-query.service';
import {LibraryService} from '../service/library.service';
import {UserService} from '../../settings/user-management/user.service';
import {type LibraryShelfMenuTarget} from '../../../shared/layout/navigation/library-shelf-menu-target.model';
import {libraryShelfMenuAvailable} from '../components/library-shelf-menu/library-shelf-menu-items.component';
import {
  browseFilterGroups,
  browseFilterChips,
  browseFrozenFacetOrders,
  withBrowseFacetRange,
  withBrowseFacetValues,
  type BrowseFacetDefinitions,
  type BrowseFilterChip,
  type BrowseFilterGroup,
  type BrowseFilterOpen,
  type BrowseFilterRangeCommit,
  type BrowseFilterSearch,
  type BrowseFrozenFacetOrders,
} from '../../../shared/browse/facets';
import {bookFacetDefinitions, bookFacetLabelDeps} from './book-browse-facet-definitions';
import {FACET_FIELDS} from './book-browse-fields';
import {
  bookBrowseScopeMenuTarget,
  bookBrowseScopeTitle,
  scopedFacetSelection,
  type BookBrowseScope,
} from './book-browse-scope';

const keepPrevious = (previous: BrowseFacetGroup | undefined) => previous;

interface FacetSection {
  readonly pending: Signal<boolean>;
  readonly served: Signal<BrowseFacetGroup | undefined>;
  readonly unfiltered: Signal<BrowseFacetGroup | undefined>;
}

export interface BookBrowseQueriesOptions {
  readonly selection: Signal<FacetValueMap>;
  readonly query: Signal<string>;
  readonly scope: Signal<BookBrowseScope | null>;
  readonly enabled?: Signal<boolean>;
}

export function createBookBrowseQueries({selection, query, scope, enabled}: BookBrowseQueriesOptions) {
  const bookQuery = inject(BookQueryService);
  const transloco = inject(TranslocoService);
  const libraryService = inject(LibraryService);
  const magicShelfService = inject(MagicShelfService);
  const shelfDefinitionQuery = inject(ShelfDefinitionQueryService);
  const userService = inject(UserService);
  const activeLang = toSignal(transloco.langChanges$, {initialValue: transloco.getActiveLang()});

  const collectionParams = computed<BookCollectionFilterParams>(() => ({
    facets: scopedFacetSelection(selection(), scope()),
    facetLogic: 'or',
    query: normalizeRemoteSearchTerm(query()) || undefined,
  }));
  const scopeParams = computed<BookCollectionFilterParams>(() => ({
    facets: scopedFacetSelection(EMPTY_FACET_SELECTION, scope()),
    facetLogic: 'or',
  }));
  const isEnabled = () => enabled?.() ?? true;

  const indexQuery = injectQuery(() => ({...bookQuery.facetIndex(scopeParams()), enabled: isEnabled()}));
  const available = computed<ReadonlySet<string>>(() => new Set(indexQuery.data()?.facets.map(group => group.key)));
  const openKeys = signal<ReadonlySet<string>>(new Set());
  const searchTerms = signal<Readonly<Record<string, string>>>({});
  const debouncedSearchTerms = debouncedSignal(searchTerms, SEARCH_DEBOUNCE_MS);

  const injector = inject(Injector);
  const sections = signal<ReadonlyMap<BookQueryFacetKey, FacetSection>>(new Map());

  function facetSection(key: BookQueryFacetKey): FacetSection {
    const field = FACET_FIELDS.get(key)!.facet;
    const loading = computed(() => isEnabled() && openKeys().has(key) && available().has(key));
    const withoutOwn = (params: BookCollectionFilterParams) =>
      ({...params, facets: withBrowseFacetValues(params.facets, key, [])});
    const params = computed(() => withoutOwn(collectionParams()));
    const current = injectQuery(() => ({
      ...bookQuery.facet(key, params()),
      enabled: loading(),
      placeholderData: keepPrevious,
    }), {injector});
    const unfiltered = field.banded || field.kind === 'range' ? null : injectQuery(() => ({
      ...bookQuery.facet(key, withoutOwn(scopeParams())),
      enabled: loading(),
    }), {injector});
    const searchTerm = computed(() => debouncedSearchTerms()[key] ?? '');
    const searched = injectQuery(() => ({
      ...bookQuery.facet(key, params(), searchTerm()),
      enabled: loading() && searchTerm() !== '' && current.data()?.complete === false,
      placeholderData: keepPrevious,
    }), {injector});
    return {
      pending: computed(() => loading() && current.isPending()),
      served: computed(() => (searchTerm() && searched.data()) || current.data()),
      unfiltered: computed(() => unfiltered?.data()),
    };
  }

  const served = computed(() => [...sections().values()].flatMap(section => section.served() ?? []));
  const unfilteredGroups = computed(() => [...sections().values()].flatMap(section => section.unfiltered() ?? []));

  const shelfDefinitionsQuery = injectQuery(() => shelfDefinitionQuery.definitions());
  const shelfDefinitions = computed(() => shelfDefinitionsQuery.data() ?? []);

  const definitions = computed<BrowseFacetDefinitions<BookQueryFacetKey>>(() => {
    activeLang();
    return bookFacetDefinitions(bookFacetLabelDeps(
      shelfDefinitions(),
      libraryService.libraries(),
      key => transloco.translate(key),
    ));
  });
  const frozen = computed<BrowseFrozenFacetOrders>(() => browseFrozenFacetOrders(unfilteredGroups(), definitions()));
  const railGroups = computed<BrowseFilterGroup<BookQueryFacetKey>[]>(() =>
    browseFilterGroups(available(), served(), frozen(), definitions(), selection())
      .map(group => sections().get(group.key)?.pending() ? {...group, loading: true} : group));
  const chips = computed<BrowseFilterChip<BookQueryFacetKey>[]>(() =>
    browseFilterChips(served(), frozen(), definitions(), selection()));
  const title = computed(() => {
    activeLang();
    return bookBrowseScopeTitle(scope(), libraryService.libraries(), shelfDefinitions(), magicShelfService.shelves(), {
      allBooks: transloco.translate('book.browser.labels.allBooks'),
      unshelved: transloco.translate('book.browser.labels.unshelvedBooks'),
    });
  });
  const searchHint = computed(() => {
    activeLang();
    return transloco.translate(`browse.rail.searchScope.${scope()?.kind ?? 'allBooks'}`);
  });
  const actionTarget = computed<LibraryShelfMenuTarget | null>(() => {
    const target = bookBrowseScopeMenuTarget(
      scope(),
      libraryService.libraries(),
      shelfDefinitions(),
      magicShelfService.shelves(),
    );
    return target && libraryShelfMenuAvailable(target, userService.currentUser()) ? target : null;
  });

  return {
    collectionParams,
    definitions,
    sortTokens: computed<readonly string[]>(() => indexQuery.data()?.sortTokens ?? []),
    pending: computed(() => indexQuery.isPending()),
    chips,
    railGroups,
    title,
    searchHint,
    actionTarget,
    setOpen: ({key, open}: BrowseFilterOpen<BookQueryFacetKey>) => {
      if (open && !sections().has(key)) {
        sections.update(current => new Map(current).set(key, facetSection(key)));
      }
      openKeys.update(keys => {
        const next = new Set(keys);
        if (open) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
    },
    setSearch: ({key, term}: BrowseFilterSearch<BookQueryFacetKey>) =>
      searchTerms.update(terms => ({...terms, [key]: term})),
    withRange: (current: FacetValueMap, {key, min, max}: BrowseFilterRangeCommit<BookQueryFacetKey>) => {
      const bands = served().find(group => group.key === key)?.values ?? [];
      return withBrowseFacetRange(current, key, min, max, new Set(bands.map(value => value.value)));
    },
  };
}
