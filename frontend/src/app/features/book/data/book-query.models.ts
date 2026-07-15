import {InfiniteData} from '@tanstack/angular-query-experimental';

import {BrowsePage} from '../../../core/data/browse.models';
import {BookSummary} from './book-response.models';

export type BookPage = BrowsePage<BookSummary>;

export type BookFacetValueState = 'any' | 'must' | 'not';

export interface BookFacetValue {
  value: string;
  title: string;
  count?: number;
  state: BookFacetValueState | null;
}

export interface BookFacetGroup {
  rel: string;
  key: string;
  title: string;
  values: BookFacetValue[];
}

export function flattenBookPages(
  data: InfiniteData<BookPage> | undefined,
): BookSummary[] {
  return data?.pages.flatMap(page => page.content) ?? [];
}
