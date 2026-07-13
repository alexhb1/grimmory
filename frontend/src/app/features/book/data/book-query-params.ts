import {HttpParams} from '@angular/common/http';

export const BOOK_QUERY_MAX_PAGE_SIZE = 100;

export type FacetValueMap = Readonly<Partial<Record<string, readonly string[]>>>;
export type SortDirection = 'asc' | 'desc';

export interface BookFacetSelection {
  any: FacetValueMap;
  must: FacetValueMap;
  not: FacetValueMap;
}

export const EMPTY_FACET_SELECTION: BookFacetSelection = {any: {}, must: {}, not: {}};

export interface BookSortTerm {
  key: string;
  direction: SortDirection;
}

export interface BookQueryParams {
  query?: string;
  facets: BookFacetSelection;
  sort: readonly BookSortTerm[];
}

export interface BookPageParams extends BookQueryParams {
  size: number;
}

export interface BookPageAtParams extends BookPageParams {
  page: number;
}

export interface NormalizedBookQueryParams {
  query?: string;
  facets: BookFacetSelection;
  sort: readonly BookSortTerm[];
}

export interface NormalizedBookPageParams extends NormalizedBookQueryParams {
  size: number;
}

export interface NormalizedBookPageAtParams extends NormalizedBookPageParams {
  page: number;
}

export interface NormalizedBookFacetParams {
  query?: string;
  facets: BookFacetSelection;
}

export type NormalizedBookIdsParams = NormalizedBookQueryParams;

export interface NormalizedBookBatchParams {
  bookIds: readonly number[];
  withDescription: boolean;
}

const DEFAULT_SORT: readonly BookSortTerm[] = [{key: 'addedOn', direction: 'desc'}];
const SORT_DIRECTIONS = new Set<string>(['asc', 'desc']);

export function normalizeBookPageParams(params: BookPageParams): NormalizedBookPageParams {
  if (!Number.isInteger(params.size) || params.size < 1 || params.size > BOOK_QUERY_MAX_PAGE_SIZE) {
    throw new Error(`Book query page size must be between 1 and ${BOOK_QUERY_MAX_PAGE_SIZE}.`);
  }

  return {
    ...normalizeBookQueryParams(params),
    size: params.size,
  };
}

export function normalizeBookPageAtParams(params: BookPageAtParams): NormalizedBookPageAtParams {
  if (!Number.isSafeInteger(params.page) || params.page < 0) {
    throw new Error('Book query page number must be a non-negative integer.');
  }

  return {
    ...normalizeBookPageParams(params),
    page: params.page,
  };
}

export function normalizeBookFacetParams(params: BookQueryParams): NormalizedBookFacetParams {
  const normalized = normalizeBookQueryParams(params);
  return {
    ...(normalized.query == null ? {} : {query: normalized.query}),
    facets: normalized.facets,
  };
}

export function normalizeBookIdsParams(params: BookQueryParams): NormalizedBookIdsParams {
  return normalizeBookQueryParams(params);
}

export function normalizeBookId(bookId: number): number {
  if (!Number.isSafeInteger(bookId) || bookId <= 0) {
    throw new Error('Book ID must be a positive integer.');
  }
  return bookId;
}

export function normalizeBookBatchParams(
  bookIds: readonly number[],
  withDescription: boolean,
): NormalizedBookBatchParams {
  const normalizedIds = [...new Set(bookIds.map(normalizeBookId))].sort((first, second) => first - second);
  if (normalizedIds.length === 0) {
    throw new Error('At least one book ID is required.');
  }
  return {bookIds: normalizedIds, withDescription};
}

export function normalizeRecommendationLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new Error('Book recommendation limit must be between 1 and 25.');
  }
  return limit;
}

export function toPageHttpParams(params: NormalizedBookPageParams): HttpParams {
  return toCollectionHttpParams(params)
    .set('sort', serializeSort(params.sort))
    .set('size', params.size.toString());
}

export function toPageAtHttpParams(params: NormalizedBookPageAtParams): HttpParams {
  return toPageHttpParams(params).set('page', params.page.toString());
}

export function toFacetHttpParams(params: NormalizedBookFacetParams): HttpParams {
  return toCollectionHttpParams(params);
}

export function toIdsHttpParams(params: NormalizedBookIdsParams): HttpParams {
  return toCollectionHttpParams(params).set('sort', serializeSort(params.sort));
}

export function normalizeBookQueryParams(params: BookQueryParams): NormalizedBookQueryParams {
  const query = params.query?.trim();
  const facets: BookFacetSelection = {
    any: normalizeFacetValueMap(params.facets.any),
    must: normalizeFacetValueMap(params.facets.must),
    not: normalizeFacetValueMap(params.facets.not),
  };

  const sort = params.sort.length === 0
    ? DEFAULT_SORT
    : params.sort.map(term => {
        const key = term.key.trim();
        if (!key) {
          throw new Error('Book query sort key must not be empty.');
        }
        if (!SORT_DIRECTIONS.has(term.direction)) {
          throw new Error(`Unsupported book query sort direction: ${term.direction}`);
        }
        return {key, direction: term.direction};
      });

  return {
    ...(query ? {query} : {}),
    facets,
    sort,
  };
}

function toCollectionHttpParams(params: NormalizedBookFacetParams): HttpParams {
  // The any bucket is always any-of; without this the backend defaults facet_logic to "and".
  let httpParams = new HttpParams().set('facet_logic', 'or');

  if (params.query) {
    httpParams = httpParams.set('query', params.query);
  }

  httpParams = appendFacetParams(httpParams, 'facet', params.facets.any);
  httpParams = appendFacetParams(httpParams, 'facet_must', params.facets.must);
  return appendFacetParams(httpParams, 'facet_not', params.facets.not);
}

function normalizeFacetValueMap(facets: FacetValueMap): FacetValueMap {
  const normalized = new Map<string, readonly string[]>();

  for (const rawKey of Object.keys(facets).sort()) {
    const key = rawKey.trim();
    if (!key) {
      throw new Error('Book query facet key must not be empty.');
    }

    const values = [...new Set((facets[rawKey] ?? [])
      .map(value => value.trim())
      .filter(Boolean))].sort();

    if (values.length > 0) {
      normalized.set(key, values);
    }
  }

  return Object.fromEntries(normalized);
}

function appendFacetParams(
  httpParams: HttpParams,
  parameterName: 'facet' | 'facet_must' | 'facet_not',
  facets: FacetValueMap,
): HttpParams {
  let result = httpParams;
  for (const [key, values] of Object.entries(facets)) {
    for (const value of values ?? []) {
      result = result.append(parameterName, `${key}:${value}`);
    }
  }

  return result;
}

function serializeSort(sort: readonly BookSortTerm[]): string {
  return sort
    .map(term => `${term.direction === 'desc' ? '-' : ''}${term.key}`)
    .join(',');
}
