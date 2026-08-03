import {hashKey} from '@tanstack/angular-query-experimental';

import {bookQueryKeys} from '../data/book-query-keys';
import {
  BookQueryParams,
  normalizeBookCollectionFilterParams,
  normalizeBookQueryParams,
} from '../data/book-query-params';
import {BookQueryService} from '../data/book-query.service';

export function bookBrowseCollection(bookQuery: BookQueryService, params: BookQueryParams) {
  const ordering = normalizeBookQueryParams(params);
  const membership = normalizeBookCollectionFilterParams(params);

  return {
    membershipIdentity: hashKey(bookQueryKeys.facets(membership)),
    orderingIdentity: hashKey(bookQueryKeys.ids(ordering)),
    infinitePage: (size: number) => bookQuery.infinitePage({...ordering, size}),
    facets: () => bookQuery.facets(membership),
    ids: () => bookQuery.ids(ordering),
  };
}
