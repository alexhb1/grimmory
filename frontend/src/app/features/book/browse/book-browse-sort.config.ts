import {
  LucideArrowDown10,
  LucideArrowDownNarrowWide,
  LucideArrowDownZA,
  LucideArrowUp01,
  LucideArrowUpNarrowWide,
  LucideArrowUpAZ,
  LucideCalendarArrowDown,
  LucideCalendarArrowUp,
  LucideClockArrowDown,
  LucideClockArrowUp,
  type LucideIconData,
} from '@lucide/angular';

import {
  DEFAULT_BOOK_SORT_TERMS,
  type BookSortTerm,
  type SortDirection,
} from '../data/book-query-params';

export interface BookSortOption {
  id: string;
  labelKey?: string;
  fallbackLabel: string;
  group: 'common' | 'more';
  defaultDirection: SortDirection;
  directions: readonly SortDirection[];
}

export interface BookSortSelection {
  option: BookSortOption;
  direction: SortDirection;
}

const LABEL_KEYS: Readonly<Record<string, string>> = {
  title: 'book.sorting.options.title',
  seriesName: 'browse.sort.seriesOrder',
  seriesNumber: 'book.columnPref.columns.seriesNumber',
  addedOn: 'browse.sort.dateAdded',
  lastReadTime: 'book.sorting.options.lastReadTime',
  publishedDate: 'book.columnPref.columns.publishedDate',
  personalRating: 'browse.sort.rating',
  readingProgress: 'browse.sort.progress',
  publisher: 'book.sorting.options.publisher',
  pageCount: 'book.filter.labels.pageCount',
  narrator: 'book.sorting.options.narrator',
  language: 'book.filter.labels.language',
  dateFinished: 'book.sorting.options.dateFinished',
  readStatus: 'book.sorting.options.readStatus',
  amazonRating: 'book.sorting.options.amazonRating',
  amazonReviewCount: 'book.columnPref.columns.amazonReviewCount',
  goodreadsRating: 'book.sorting.options.goodreadsRating',
  goodreadsReviewCount: 'book.columnPref.columns.goodreadsReviewCount',
  hardcoverRating: 'book.sorting.options.hardcoverRating',
  hardcoverReviewCount: 'book.columnPref.columns.hardcoverReviewCount',
  ranobedbRating: 'book.sorting.options.ranobedbRating',
};

const COMMON_KEYS: ReadonlySet<string> = new Set([
  'title',
  'seriesName',
  'addedOn',
  'lastReadTime',
  'publishedDate',
  'personalRating',
  'readingProgress',
]);

const DEFAULT_DESCENDING_KEYS: ReadonlySet<string> = new Set([
  'addedOn',
  'lastReadTime',
  'publishedDate',
  'personalRating',
  'readingProgress',
  'pageCount',
  'dateFinished',
  'amazonRating',
  'amazonReviewCount',
  'goodreadsRating',
  'goodreadsReviewCount',
  'hardcoverRating',
  'hardcoverReviewCount',
  'ranobedbRating',
]);

const ALPHABETICAL_SORT_FIELDS = new Set<string>([
  'title',
  'seriesName',
  'publisher',
  'narrator',
  'language',
  'readStatus',
]);
const NUMERIC_SORT_FIELDS = new Set<string>([
  'seriesNumber',
  'amazonRating',
  'amazonReviewCount',
  'goodreadsRating',
  'goodreadsReviewCount',
  'hardcoverRating',
  'hardcoverReviewCount',
  'ranobedbRating',
  'pageCount',
  'personalRating',
  'readingProgress',
]);
const CALENDAR_SORT_FIELDS = new Set<string>([
  'addedOn',
  'publishedDate',
  'dateFinished',
]);

export function sortDirectionIcon(selection: BookSortSelection): LucideIconData {
  const ascending = selection.direction === 'asc';
  const field = selection.option.id;

  if (ALPHABETICAL_SORT_FIELDS.has(field)) {
    return ascending ? LucideArrowUpAZ.icon : LucideArrowDownZA.icon;
  }
  if (NUMERIC_SORT_FIELDS.has(field)) {
    return ascending ? LucideArrowUp01.icon : LucideArrowDown10.icon;
  }
  if (CALENDAR_SORT_FIELDS.has(field)) {
    return ascending ? LucideCalendarArrowUp.icon : LucideCalendarArrowDown.icon;
  }
  if (field === 'lastReadTime') {
    return ascending ? LucideClockArrowUp.icon : LucideClockArrowDown.icon;
  }
  return ascending ? LucideArrowUpNarrowWide.icon : LucideArrowDownNarrowWide.icon;
}

function humanizeSortKey(key: string): string {
  const words = key.replace(/([a-z\d])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function buildSortOption(
  key: string,
  directions: readonly SortDirection[],
): BookSortOption {
  const labelKey = Object.hasOwn(LABEL_KEYS, key) ? LABEL_KEYS[key] : undefined;
  const preferredDirection = DEFAULT_DESCENDING_KEYS.has(key) ? 'desc' : 'asc';
  return {
    id: key,
    ...(labelKey ? {labelKey} : {}),
    fallbackLabel: humanizeSortKey(key),
    group: COMMON_KEYS.has(key) ? 'common' : 'more',
    defaultDirection: directions.includes(preferredDirection) ? preferredDirection : directions[0],
    directions,
  };
}

export function buildSortOptions(serverSortTokens: readonly string[]): BookSortOption[] {
  const directionsByKey = new Map<string, SortDirection[]>();
  for (const token of serverSortTokens) {
    const [term] = parseSortTermsToken(token);
    if (!term || token.includes(',')) {
      continue;
    }
    const directions = directionsByKey.get(term.key) ?? [];
    if (!directions.includes(term.direction)) {
      directions.push(term.direction);
      directionsByKey.set(term.key, directions);
    }
  }
  return [...directionsByKey].map(([key, directions]) => buildSortOption(key, directions));
}

export const DEFAULT_BOOK_SORT: BookSortSelection = {
  option: buildSortOption(DEFAULT_BOOK_SORT_TERMS[0].key, [DEFAULT_BOOK_SORT_TERMS[0].direction]),
  direction: DEFAULT_BOOK_SORT_TERMS[0].direction,
};

export function parseSortToken(token: string | null): BookSortSelection | null {
  const first = parseSortTermsToken(token)[0];
  return first
    ? {option: buildSortOption(first.key, [first.direction]), direction: first.direction}
    : null;
}

export function sortToken(selection: BookSortSelection): string {
  return selection.direction === 'desc' ? `-${selection.option.id}` : selection.option.id;
}

export function parseSortTermsToken(token: string | null): BookSortTerm[] {
  if (!token) return [];

  const seen = new Set<string>();
  const terms: BookSortTerm[] = [];
  for (const rawTerm of token.split(',')) {
    const term = rawTerm.trim();
    if (!term) continue;
    const descending = term.startsWith('-');
    const key = (descending ? term.slice(1) : term).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    terms.push({key, direction: descending ? 'desc' : 'asc'});
  }
  return terms;
}

export function sortTermsToken(terms: readonly BookSortTerm[]): string {
  return terms
    .map(term => term.direction === 'desc' ? `-${term.key}` : term.key)
    .join(',');
}

export function sortTerms(selection: BookSortSelection): BookSortTerm[] {
  return [{key: selection.option.id, direction: selection.direction}];
}
