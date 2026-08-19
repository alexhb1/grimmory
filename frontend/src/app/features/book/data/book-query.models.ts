import {InfiniteData} from '@tanstack/angular-query-experimental';

import {BrowseFacetGroup, BrowseFacetResult, BrowsePage, flattenBrowsePages} from '../../../core/data/browse.models';
import {BookSummary} from './book-response.models';

export type BookPage = BrowsePage<BookSummary>;
export type BookFacetGroup = BrowseFacetGroup;
export type BookFacetResult = BrowseFacetResult;

export function flattenBookPages(
  data: InfiniteData<BookPage> | undefined,
): BookSummary[] {
  return flattenBrowsePages(data);
}
