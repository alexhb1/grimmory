import {
  type BookSortTerm,
  type SortDirection,
} from '../data/book-query-params';

export interface BookSortOption {
  id: string;
  labelKey?: string;
  fallbackLabel: string;
  group: 'common' | 'more';
  defaultDirection: SortDirection;
  tiebreakers: readonly string[];
}

export interface BookSortSelection {
  option: BookSortOption;
  direction: SortDirection;
}

const LABEL_KEYS: Readonly<Record<string, string>> = {
  title: 'browse.sort.title',
  seriesName: 'browse.sort.seriesOrder',
  seriesNumber: 'browse.table.columns.seriesNumber',
  addedOn: 'browse.sort.dateAdded',
  lastReadTime: 'browse.sort.lastRead',
  publishedDate: 'browse.sort.published',
  personalRating: 'browse.sort.rating',
  readingProgress: 'browse.sort.progress',
  publisher: 'browse.sort.publisher',
  pageCount: 'browse.sort.pageCount',
  narrator: 'browse.sort.narrator',
  language: 'browse.sort.language',
  dateFinished: 'browse.sort.dateFinished',
  readStatus: 'browse.sort.readStatus',
  amazonRating: 'browse.sort.amazonRating',
  amazonReviewCount: 'browse.table.columns.amazonReviewCount',
  goodreadsRating: 'browse.sort.goodreadsRating',
  goodreadsReviewCount: 'browse.table.columns.goodreadsReviewCount',
  hardcoverRating: 'browse.sort.hardcoverRating',
  hardcoverReviewCount: 'browse.table.columns.hardcoverReviewCount',
  ranobedbRating: 'browse.sort.ranobedbRating',
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

// Tiebreakers append ascending so equal primary values remain deterministic.
const TIEBREAKERS: Readonly<Record<string, readonly string[]>> = {
  seriesName: ['seriesNumber'],
  publishedDate: ['title'],
  personalRating: ['title'],
  publisher: ['title'],
  narrator: ['title'],
  language: ['title'],
  readStatus: ['title'],
};

function humanizeSortKey(key: string): string {
  const words = key.replace(/([a-z\d])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function buildSortOption(key: string): BookSortOption {
  const labelKey = Object.hasOwn(LABEL_KEYS, key) ? LABEL_KEYS[key] : undefined;
  return {
    id: key,
    ...(labelKey ? {labelKey} : {}),
    fallbackLabel: humanizeSortKey(key),
    group: COMMON_KEYS.has(key) ? 'common' : 'more',
    defaultDirection: DEFAULT_DESCENDING_KEYS.has(key) ? 'desc' : 'asc',
    tiebreakers: Object.hasOwn(TIEBREAKERS, key) ? TIEBREAKERS[key] : [],
  };
}

export function buildSortOptions(serverSortKeys: readonly string[]): BookSortOption[] {
  return serverSortKeys.map(buildSortOption);
}

export const DEFAULT_BOOK_SORT: BookSortSelection = {
  option: buildSortOption('title'),
  direction: 'asc',
};

export function parseSortToken(token: string | null): BookSortSelection | null {
  const first = parseSortTermsToken(token)[0];
  return first
    ? {option: buildSortOption(first.key), direction: first.direction}
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
  return [
    {key: selection.option.id, direction: selection.direction},
    ...selection.option.tiebreakers.map((key): BookSortTerm => ({key, direction: 'asc'})),
  ];
}
