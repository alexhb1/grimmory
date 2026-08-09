import { computed, effect, inject, Injectable } from '@angular/core';
import { injectInfiniteQuery } from '@tanstack/angular-query-experimental';

import {
  DEFAULT_BOOK_SORT_TERMS,
  EMPTY_FACET_SELECTION,
  type BookPageParams,
} from '../../book/data/book-query-params';
import { flattenBookPages } from '../../book/data/book-query.models';
import { BookQueryService } from '../../book/data/book-query.service';

const STATS_BOOK_PAGE_PARAMS = {
  facets: EMPTY_FACET_SELECTION,
  facetLogic: 'and',
  sort: DEFAULT_BOOK_SORT_TERMS,
  size: 100,
} as const satisfies BookPageParams;

@Injectable()
export class AllBooksStatsSourceService {
  private readonly bookQuery = inject(BookQueryService);
  private readonly booksQuery = injectInfiniteQuery(() =>
    this.bookQuery.infinitePage(STATS_BOOK_PAGE_PARAMS),
  );
  private lastAutoFetchedPageCount = 0;

  readonly isError = computed(
    () => this.booksQuery.isError() || this.booksQuery.isFetchNextPageError(),
  );
  readonly isLoading = computed(
    () =>
      !this.isError()
      && (this.booksQuery.isPending()
        || this.booksQuery.isFetchingNextPage()
        || (this.booksQuery.isSuccess() && this.booksQuery.hasNextPage())),
  );
  readonly books = computed(() => {
    if (this.isLoading() || this.isError()) return [];
    return flattenBookPages(this.booksQuery.data());
  });

  constructor() {
    effect(() => {
      const loadedPageCount = this.booksQuery.data()?.pages.length ?? 0;
      if (this.isError()) {
        this.lastAutoFetchedPageCount = 0;
        return;
      }

      if (
        this.booksQuery.isSuccess()
        && this.booksQuery.hasNextPage()
        && !this.booksQuery.isFetching()
        && loadedPageCount > this.lastAutoFetchedPageCount
      ) {
        this.lastAutoFetchedPageCount = loadedPageCount;
        void this.booksQuery.fetchNextPage();
      }
    });
  }
}
