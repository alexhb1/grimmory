import {HttpParams} from '@angular/common/http';

import {
  BrowseFacetLogic,
  BrowseSortDirection,
  BrowseSortTerm,
} from '../../../core/data/browse.models';
import {normalizeBookIds} from './book-id';

export {normalizeBookId} from './book-id';

export const BOOK_QUERY_MAX_PAGE_SIZE = 100;

export const BOOK_QUERY_FACET_KEYS = [
  'author',
  'series',
  'genre',
  'tag',
  'mood',
  'language',
  'publisher',
  'library',
  'shelf',
  'file_type',
  'read_status',
  'personal_rating',
  'amazon_rating',
  'goodreads_rating',
  'hardcover_rating',
  'ranobedb_rating',
  'age_rating',
  'content_rating',
  'match_score',
  'published_year',
  'file_size',
  'page_count',
  'shelf_status',
  'comic_character',
  'comic_team',
  'comic_location',
  'comic_creator',
] as const;

export const BOOK_QUERY_SORT_KEYS = [
  'addedOn',
  'title',
  'seriesName',
  'seriesNumber',
  'publisher',
  'publishedDate',
  'amazonRating',
  'amazonReviewCount',
  'goodreadsRating',
  'goodreadsReviewCount',
  'hardcoverRating',
  'hardcoverReviewCount',
  'ranobedbRating',
  'narrator',
  'pageCount',
  'language',
  'personalRating',
  'lastReadTime',
  'readStatus',
  'dateFinished',
  'readingProgress',
] as const;

export type BookQueryFacetKey = typeof BOOK_QUERY_FACET_KEYS[number];
export type BookQuerySortKey = typeof BOOK_QUERY_SORT_KEYS[number];
export type FacetLogic = BrowseFacetLogic;
export type FacetValueMap = Readonly<Partial<Record<BookQueryFacetKey, readonly string[]>>>;
export type SortDirection = BrowseSortDirection;

export const EMPTY_FACET_SELECTION: FacetValueMap = {};

export type BookSortTerm = BrowseSortTerm<BookQuerySortKey>;

export interface BookCollectionFilterParams {
  query?: string;
  facets: FacetValueMap;
  facetLogic: FacetLogic;
}

export interface BookQueryParams extends BookCollectionFilterParams {
  sort: readonly BookSortTerm[];
}

export interface BookPageParams extends BookQueryParams {
  size: number;
}

export interface BookDescriptionOptions {
  withDescription: boolean;
}

export interface NormalizedBookBatchParams {
  bookIds: readonly number[];
  withDescription: boolean;
}

export const DEFAULT_BOOK_SORT_TERMS: readonly BookSortTerm[] = [{key: 'title', direction: 'asc'}];
const BOOK_QUERY_FACET_KEY_SET = new Set<string>(BOOK_QUERY_FACET_KEYS);
const BOOK_QUERY_SORT_KEY_SET = new Set<string>(BOOK_QUERY_SORT_KEYS);
const FACET_LOGICS = new Set<string>(['and', 'or', 'not']);
const SORT_DIRECTIONS = new Set<string>(['asc', 'desc']);

export function isBookQueryFacetKey(value: string): value is BookQueryFacetKey {
  return BOOK_QUERY_FACET_KEY_SET.has(value);
}

export function isBookQuerySortKey(value: string): value is BookQuerySortKey {
  return BOOK_QUERY_SORT_KEY_SET.has(value);
}

export function normalizeBookPageParams(params: BookPageParams): BookPageParams {
  if (!Number.isInteger(params.size) || params.size < 1 || params.size > BOOK_QUERY_MAX_PAGE_SIZE) {
    throw new Error(`Book query page size must be between 1 and ${BOOK_QUERY_MAX_PAGE_SIZE}.`);
  }

  return {
    ...normalizeBookQueryParams(params),
    size: params.size,
  };
}

export function normalizeBookBatchParams(
  bookIds: readonly number[],
  withDescription: boolean,
): NormalizedBookBatchParams {
  const normalizedIds = normalizeBookIds(bookIds, {sort: true});
  return {bookIds: normalizedIds, withDescription};
}

export function normalizeRecommendationLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new Error('Book recommendation limit must be between 1 and 25.');
  }
  return limit;
}

export function toPageHttpParams(params: BookPageParams): HttpParams {
  return toCollectionHttpParams(params)
    .set('sort', serializeSort(params.sort))
    .set('size', params.size.toString());
}

export function toIdsHttpParams(params: BookQueryParams): HttpParams {
  return toCollectionHttpParams(params).set('sort', serializeSort(params.sort));
}

export function normalizeBookQueryParams(params: BookQueryParams): BookQueryParams {
  const filters = normalizeBookCollectionFilterParams(params);

  const sort = params.sort.length === 0
    ? DEFAULT_BOOK_SORT_TERMS
    : params.sort.map(term => {
        const key = term.key.trim();
        if (!key) {
          throw new Error('Book query sort key must not be empty.');
        }
        if (!BOOK_QUERY_SORT_KEY_SET.has(key)) {
          throw new Error(`Unsupported book query sort key: ${key}`);
        }
        if (!SORT_DIRECTIONS.has(term.direction)) {
          throw new Error(`Unsupported book query sort direction: ${term.direction}`);
        }
        return {key: key as BookQuerySortKey, direction: term.direction};
      });

  return {
    ...filters,
    sort,
  };
}

export function normalizeBookCollectionFilterParams(
  params: BookCollectionFilterParams,
): BookCollectionFilterParams {
  const query = params.query?.trim();
  const facets = normalizeFacetValueMap(params.facets);
  if (!FACET_LOGICS.has(params.facetLogic)) {
    throw new Error(`Unsupported book query facet logic: ${params.facetLogic}`);
  }

  return {
    ...(query ? {query} : {}),
    facets,
    facetLogic: params.facetLogic,
  };
}

export function toCollectionHttpParams(params: BookCollectionFilterParams): HttpParams {
  let httpParams = new HttpParams().set('facet_logic', params.facetLogic);

  if (params.query) {
    httpParams = httpParams.set('query', params.query);
  }

  return appendFacetParams(httpParams, params.facets);
}

function normalizeFacetValueMap(facets: FacetValueMap): FacetValueMap {
  const normalized = new Map<string, readonly string[]>();
  const rawFacets = facets as Readonly<Record<string, readonly string[] | undefined>>;

  for (const rawKey of Object.keys(rawFacets).sort()) {
    const key = rawKey.trim();
    if (!key) {
      throw new Error('Book query facet key must not be empty.');
    }
    if (!BOOK_QUERY_FACET_KEY_SET.has(key)) {
      throw new Error(`Unsupported book query facet key: ${key}`);
    }

    const values = [...new Set((rawFacets[rawKey] ?? [])
      .map(value => value.trim())
      .filter(Boolean))].sort();

    if (values.length > 0) {
      normalized.set(key, values);
    }
  }

  return Object.fromEntries(normalized);
}

function appendFacetParams(httpParams: HttpParams, facets: FacetValueMap): HttpParams {
  let result = httpParams;
  for (const [key, values] of Object.entries(facets)) {
    for (const value of values ?? []) {
      result = result.append('facet', `${key}:${value}`);
    }
  }

  return result;
}

function serializeSort(sort: readonly BookSortTerm[]): string {
  return sort
    .map(term => `${term.direction === 'desc' ? '-' : ''}${term.key}`)
    .join(',');
}
