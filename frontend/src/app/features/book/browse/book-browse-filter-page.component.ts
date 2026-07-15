import {ChangeDetectionStrategy, Component, DestroyRef, computed, inject, linkedSignal, signal, untracked} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {injectQuery} from '@tanstack/angular-query-experimental';

import {
  BrowseFilterRailComponent,
  type FilterRailToggle,
} from '../../../shared/components/browse/browse-filter-rail/browse-filter-rail.component';
import {LucideSearch, LucideX} from '@lucide/angular';

import {AppButtonComponent} from '../../../shared/ui/button/app-button.component';
import {AppInputComponent} from '../../../shared/ui/input/app-input.component';
import {AppPageHeaderComponent} from '../../../shared/layout/page-header/app.page-header.component';
import {type PageHeader} from '../../../shared/layout/page-header/page-header.service';
import {EMPTY_FACET_SELECTION, type BookFacetSelection} from '../data/book-query-params';
import {type BookFacetGroup, type BookPage} from '../data/book-query.models';
import {BookQueryService} from '../data/book-query.service';
import {
  browseFacetQueryParams,
  buildRailGroups,
  countFacetSelections,
  cycleFacetValue,
  freezeFacetOrders,
  mustFacetKeys,
  parseBrowseFacetSelection,
  toggleFacetSelection,
  type FrozenFacetOrders,
} from './book-browse-facets';
import {AdvancedFilteringPreferenceService} from './advanced-filtering-preference.service';
import {bookBrowseScope, scopedFacetSelection} from './book-browse-scope';
import {DEFAULT_BOOK_SORT, parseSortToken, sortTerms} from './book-browse-sort.config';

const QUERY_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-book-browse-filter-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, AppButtonComponent, AppInputComponent, AppPageHeaderComponent, BrowseFilterRailComponent, LucideSearch, LucideX],
  template: `
    <div class="app-page pb-0!">
      <app-page-header [pageHeader]="pageHeader()">
        <div class="w-full">
          <app-input
            [placeholder]="searchHint()"
            [ariaLabel]="searchHint()"
            [value]="stagedQuery()"
            (valueChange)="onQueryChange($event)"
            (enterPressed)="onCommit()">
            <svg lucideSearch appInputLeading class="size-4" aria-hidden="true"></svg>
            @if (stagedQuery()) {
              <button
                type="button"
                appInputTrailing
                class="-mr-1.5 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted touch-manipulation transition-colors hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary pointer-coarse:-mr-3 pointer-coarse:size-10"
                [attr.aria-label]="'book.searcher.clearSearch' | transloco"
                (click)="onClearQuery()">
                <svg lucideX class="size-4" aria-hidden="true"></svg>
              </button>
            }
          </app-input>
        </div>
      </app-page-header>

      <div class="pb-28">
        <app-browse-filter-rail
          alwaysShowBoxes
          [groups]="railGroups()"
          (toggleValue)="onToggle($event)" />
      </div>

      <div
        class="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-border bg-page px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <app-button
          variant="ghost"
          [label]="'browse.filterPage.clear' | transloco"
          [disabled]="!hasStagedEdits()"
          (clicked)="onClear()" />
        <app-button
          tone="primary"
          fluid
          [label]="'browse.filterPage.show' | transloco: {count: previewTotal() ?? '…'}"
          [loading]="previewLoading()"
          (clicked)="onCommit()" />
      </div>
    </div>
  `,
})
export class BookBrowseFilterPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookQuery = inject(BookQueryService);
  private readonly transloco = inject(TranslocoService);
  private readonly advancedFiltering = inject(AdvancedFilteringPreferenceService);
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly sort = computed(() =>
    sortTerms(parseSortToken(this.queryParamMap().get('sort')) ?? DEFAULT_BOOK_SORT),
  );

  protected readonly staged = signal<BookFacetSelection>(
    parseBrowseFacetSelection(
      this.route.snapshot.queryParamMap.getAll('facet'),
      this.route.snapshot.queryParamMap.getAll('facet_must'),
      this.route.snapshot.queryParamMap.getAll('facet_not'),
    ),
  );
  protected readonly stagedCount = computed(() => countFacetSelections(this.staged()));
  protected readonly stagedQuery = signal(this.route.snapshot.queryParamMap.get('query') ?? '');
  private readonly debouncedQuery = signal(this.stagedQuery().trim());
  private queryDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly hasStagedEdits = computed(() => this.stagedCount() > 0 || this.stagedQuery().trim().length > 0);

  private readonly scope = computed(() =>
    bookBrowseScope(this.route.snapshot.paramMap, this.route.snapshot.data),
  );
  private readonly facetsQuery = injectQuery(() => ({
    ...this.bookQuery.facets({
      facets: scopedFacetSelection(this.staged(), this.scope()),
      query: this.debouncedQuery() || undefined,
    }),
    placeholderData: (previous: BookFacetGroup[] | undefined) => previous,
  }));
  private readonly unfilteredFacetsQuery = injectQuery(() => ({
    ...this.bookQuery.facets({
      facets: scopedFacetSelection(EMPTY_FACET_SELECTION, this.scope()),
    }),
  }));
  private readonly frozenFacets = computed<FrozenFacetOrders | null>(() => {
    const data = this.unfilteredFacetsQuery.data();
    return data && data.length > 0 ? freezeFacetOrders(data) : null;
  });
  private readonly displayedMustKeys = linkedSignal({
    source: () => this.facetsQuery.data(),
    computation: (): ReadonlySet<string> => untracked(() => mustFacetKeys(this.staged())),
  });
  protected readonly railGroups = computed(() =>
    buildRailGroups(
      this.facetsQuery.data() ?? [],
      this.frozenFacets() ?? undefined,
      this.displayedMustKeys(),
    ),
  );

  private readonly previewQuery = injectQuery(() => ({
    ...this.bookQuery.page({
      size: 1,
      facets: scopedFacetSelection(this.staged(), this.scope()),
      sort: this.sort(),
      query: this.debouncedQuery() || undefined,
    }),
    placeholderData: (previous: BookPage | undefined) => previous,
  }));
  protected readonly previewTotal = computed(() => this.previewQuery.data()?.page.totalElements ?? null);
  protected readonly previewLoading = computed(() => this.previewQuery.isPending());

  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  protected readonly pageHeader = computed<PageHeader>(() => {
    this.activeLang();
    return {
      title: this.transloco.translate('browse.filterPage.title'),
      breadcrumbs: [
        {
          label: this.transloco.translate('book.browser.labels.allBooks'),
          commands: ['/', ...this.route.parent!.snapshot.url.map(segment => segment.path)],
          queryParamsHandling: 'preserve',
        },
        {label: this.transloco.translate('browse.filterPage.title')},
      ],
    };
  });

  protected readonly searchHint = computed(() => {
    this.activeLang();
    return this.transloco.translate('browse.rail.search', {
      scope: this.transloco.translate('book.browser.labels.allBooks'),
    });
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      if (this.queryDebounceTimer != null) {
        clearTimeout(this.queryDebounceTimer);
      }
    });
  }

  protected onToggle(toggle: FilterRailToggle): void {
    this.staged.update(current =>
      toggle.origin === 'row' && this.advancedFiltering.enabled()
        ? cycleFacetValue(current, toggle.key, toggle.value)
        : toggleFacetSelection(current, toggle.key, toggle.value, toggle.selected),
    );
  }

  protected onQueryChange(value: string): void {
    this.stagedQuery.set(value);
    if (this.queryDebounceTimer != null) {
      clearTimeout(this.queryDebounceTimer);
    }
    this.queryDebounceTimer = setTimeout(() => {
      this.queryDebounceTimer = null;
      this.debouncedQuery.set(this.stagedQuery().trim());
    }, QUERY_DEBOUNCE_MS);
  }

  protected onClearQuery(): void {
    if (this.queryDebounceTimer != null) {
      clearTimeout(this.queryDebounceTimer);
      this.queryDebounceTimer = null;
    }
    this.stagedQuery.set('');
    this.debouncedQuery.set('');
  }

  protected onClear(): void {
    if (this.queryDebounceTimer != null) {
      clearTimeout(this.queryDebounceTimer);
      this.queryDebounceTimer = null;
    }
    this.staged.set(EMPTY_FACET_SELECTION);
    this.stagedQuery.set('');
    this.debouncedQuery.set('');
  }

  protected onCommit(): void {
    const query = this.stagedQuery().trim();
    this.router.navigate(['..'], {
      relativeTo: this.route,
      queryParams: {
        ...browseFacetQueryParams(this.staged()),
        query: query || null,
      },
      queryParamsHandling: 'merge',
    });
  }
}
