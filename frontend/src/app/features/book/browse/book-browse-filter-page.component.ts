import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
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
import {debouncedSignal} from '../../../shared/util/debounced-signal';
import {normalizeRemoteSearchTerm, SEARCH_DEBOUNCE_MS} from '../../../shared/util/search-terms';
import {AppPageHeaderComponent} from '../../../shared/layout/page-header/app.page-header.component';
import {type PageHeader} from '../../../shared/layout/page-header/page-header.service';
import {
  browseFacetQueryParams,
  countFacetSelections,
  EMPTY_FACET_SELECTION,
  parseFacetParams,
  toggleFacetSelection,
  type BookQueryFacetKey,
  type FacetValueMap,
} from '../data/book-query-params';
import {type BookFacetResult, type BookPage} from '../data/book-query.models';
import {BookQueryService} from '../data/book-query.service';
import {
  buildRailGroups,
  DEFAULT_BOOK_SORT,
  freezeFacetOrders,
  parseSortToken,
  sortTerms,
  type FrozenFacetOrders,
} from './book-browse-fields';
import {bookBrowseScope, scopedFacetSelection} from './book-browse-scope';

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

      <div class="-mx-1.5 pb-28">
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
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly sort = computed(() =>
    sortTerms(parseSortToken(this.queryParamMap().get('sort')) ?? DEFAULT_BOOK_SORT),
  );

  protected readonly staged = signal<FacetValueMap>(
    parseFacetParams(this.route.snapshot.queryParamMap.getAll('facet')),
  );
  protected readonly stagedCount = computed(() => countFacetSelections(this.staged()));
  protected readonly stagedQuery = signal(this.route.snapshot.queryParamMap.get('query') ?? '');
  private readonly debouncedQuery = debouncedSignal(
    computed(() => this.stagedQuery().trim()), SEARCH_DEBOUNCE_MS,
  );
  protected readonly hasStagedEdits = computed(() => this.stagedCount() > 0 || this.stagedQuery().trim().length > 0);

  private readonly scope = computed(() =>
    bookBrowseScope(this.route.snapshot.paramMap, this.route.snapshot.data),
  );
  private readonly facetsQuery = injectQuery(() => ({
    ...this.bookQuery.facets({
      facets: scopedFacetSelection(this.staged(), this.scope()),
      facetLogic: 'or',
      query: normalizeRemoteSearchTerm(this.debouncedQuery()) || undefined,
    }),
    placeholderData: (previous: BookFacetResult | undefined) => previous,
  }));
  private readonly unfilteredFacetsQuery = injectQuery(() => ({
    ...this.bookQuery.facets({
      facets: scopedFacetSelection(EMPTY_FACET_SELECTION, this.scope()),
      facetLogic: 'or',
    }),
  }));
  private readonly frozenFacets = computed<FrozenFacetOrders | null>(() => {
    const data = this.unfilteredFacetsQuery.data();
    return data ? freezeFacetOrders(data.facets) : null;
  });
  protected readonly railGroups = computed(() =>
    buildRailGroups(
      this.facetsQuery.data()?.facets ?? [],
      this.frozenFacets() ?? undefined,
    ),
  );

  private readonly previewQuery = injectQuery(() => ({
    ...this.bookQuery.page({
      size: 1,
      facets: scopedFacetSelection(this.staged(), this.scope()),
      facetLogic: 'or',
      sort: this.sort(),
      query: normalizeRemoteSearchTerm(this.debouncedQuery()) || undefined,
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
    const scope: string = this.transloco.translate('book.browser.labels.allBooks');
    return this.transloco.translate('browse.rail.search', {scope});
  });

  protected onToggle(toggle: FilterRailToggle<BookQueryFacetKey>): void {
    this.staged.update(current =>
      toggleFacetSelection(
        current,
        toggle.key,
        toggle.value,
        toggle.selected,
      ),
    );
  }

  protected onQueryChange(value: string): void {
    this.stagedQuery.set(value);
  }

  protected onClearQuery(): void {
    this.stagedQuery.set('');
  }

  protected onClear(): void {
    this.staged.set(EMPTY_FACET_SELECTION);
    this.stagedQuery.set('');
  }

  protected onCommit(): void {
    const query = this.stagedQuery().trim();
    void this.router.navigate(['..'], {
      relativeTo: this.route,
      queryParams: {
        ...browseFacetQueryParams(this.staged()),
        query: query || null,
      },
      queryParamsHandling: 'merge',
    });
  }
}
