import {
  LucideArrowDown10,
  LucideArrowDownZA,
  LucideArrowUp01,
  LucideArrowUpAZ,
  LucideCalendarArrowDown,
  LucideCalendarArrowUp,
  LucideClockArrowDown,
  LucideClockArrowUp,
  type LucideIconData,
} from '@lucide/angular';

import {type FilterRailGroup} from '../../../shared/components/browse/browse-filter-rail/browse-filter-rail.component';
import {type TableColumnPreference} from '../../settings/user-management/user.service';
import {
  DEFAULT_BOOK_SORT_TERMS,
  isBookQueryFacetKey,
  parseSortTermsToken,
  type BookQueryFacetKey,
  type BookQuerySortKey,
  type BookSortTerm,
  type SortDirection,
} from '../data/book-query-params';
import {type BookFacetGroup} from '../data/book-query.models';
import {type BookSummary} from '../data/book-response.models';

export interface BookSortOption {
  readonly id: BookQuerySortKey;
  readonly labelKey: string;
  readonly group: 'common' | 'more';
  readonly defaultDirection: SortDirection;
  readonly directions: readonly SortDirection[];
}

export interface BookSortSelection {
  readonly option: BookSortOption;
  readonly direction: SortDirection;
}

type BookBrowseColumnGroupId =
  'reading' | 'publishing' | 'file' | 'categorization' | 'ratings';

interface FrozenFacetValue {
  readonly value: string;
  readonly label: string;
}

interface FrozenFacetGroup {
  readonly values: readonly FrozenFacetValue[];
}

export type FrozenFacetOrders = Readonly<Record<string, FrozenFacetGroup>>;

interface BookBrowseFacetLink {
  readonly key: BookQueryFacetKey;
  readonly value: string;
}

type SortKind = 'alphabetical' | 'numeric' | 'calendar' | 'clock';

interface SortField {
  readonly key: BookQuerySortKey;
  readonly group: 'common' | 'more';
  readonly defaultDirection: SortDirection;
  readonly kind: SortKind;
  readonly showOnCard?: false;
}

export type BookBrowseColumnKind =
  'text' | 'number' | 'rating' | 'date' | 'fileSize' | 'readStatus';
export type BookBrowseColumnValue = string | number | undefined;

interface ColumnField {
  readonly key: string;
  readonly order: number;
  readonly group: BookBrowseColumnGroupId;
  readonly defaultVisible: boolean;
  readonly defaultWidth: number;
  readonly hideable?: false;
  readonly kind?: Exclude<BookBrowseColumnKind, 'text'>;
  readonly value: (book: BookSummary) => BookBrowseColumnValue;
}

interface BookBrowseField {
  readonly labelKey: string;
  readonly facetKey?: BookQueryFacetKey;
  readonly sort?: SortField;
  readonly column?: ColumnField;
  readonly facetValues?: (book: BookSummary) => readonly string[];
}

const FIELDS = [
  {
    labelKey: 'book.fields.title',
    sort: {
      key: 'title',
      group: 'common',
      defaultDirection: 'asc',
      kind: 'alphabetical',
      showOnCard: false,
    },
    column: {key: 'title', order: 0, group: 'publishing', defaultVisible: true,
      defaultWidth: 320, hideable: false,
      value: book => book.metadata?.title || book.primaryFile?.fileName || ''},
  },
  {
    labelKey: 'book.fields.author',
    facetKey: 'author',
    column: {key: 'authors', order: 1, group: 'publishing', defaultVisible: true,
      defaultWidth: 220, value: book => book.metadata?.authors?.join(', ') ?? ''},
    facetValues: book => book.metadata?.authors ?? [],
  },
  {
    labelKey: 'book.fields.series',
    facetKey: 'series',
    sort: {key: 'seriesName', group: 'common', defaultDirection: 'asc', kind: 'alphabetical'},
    column: {key: 'seriesName', order: 2, group: 'publishing', defaultVisible: true,
      defaultWidth: 190, value: book => book.metadata?.seriesName ?? ''},
    facetValues: book => book.metadata?.seriesName ? [book.metadata.seriesName] : [],
  },
  {
    labelKey: 'book.fields.seriesNumber',
    sort: {
      key: 'seriesNumber',
      group: 'more',
      defaultDirection: 'asc',
      kind: 'numeric',
      showOnCard: false,
    },
    column: {key: 'seriesNumber', order: 3, group: 'publishing', defaultVisible: true,
      defaultWidth: 168, kind: 'number', value: book => book.metadata?.seriesNumber},
  },
  {
    labelKey: 'book.fields.publisher',
    facetKey: 'publisher',
    sort: {key: 'publisher', group: 'more', defaultDirection: 'asc', kind: 'alphabetical'},
    column: {key: 'publisher', order: 10, group: 'publishing', defaultVisible: false,
      defaultWidth: 180, value: book => book.metadata?.publisher ?? ''},
    facetValues: book => book.metadata?.publisher ? [book.metadata.publisher] : [],
  },
  {
    labelKey: 'book.fields.genre',
    facetKey: 'genre',
    column: {key: 'categories', order: 11, group: 'categorization', defaultVisible: false,
      defaultWidth: 220, value: book => book.metadata?.categories?.join(', ') ?? ''},
    facetValues: book => book.metadata?.categories ?? [],
  },
  {
    labelKey: 'book.fields.tag',
    facetKey: 'tag',
  },
  {
    labelKey: 'book.fields.mood',
    facetKey: 'mood',
  },
  {
    labelKey: 'book.fields.language',
    facetKey: 'language',
    sort: {key: 'language', group: 'more', defaultDirection: 'asc', kind: 'alphabetical'},
    column: {key: 'language', order: 6, group: 'publishing', defaultVisible: true,
      defaultWidth: 112, value: book => book.metadata?.language ?? ''},
    facetValues: book => book.metadata?.language ? [book.metadata.language] : [],
  },
  {
    labelKey: 'book.fields.narrator',
    sort: {key: 'narrator', group: 'more', defaultDirection: 'asc', kind: 'alphabetical'},
  },
  {
    labelKey: 'book.fields.fileType',
    facetKey: 'file_type',
  },
  {
    labelKey: 'book.fields.readStatus',
    facetKey: 'read_status',
    sort: {key: 'readStatus', group: 'more', defaultDirection: 'asc', kind: 'alphabetical'},
    column: {key: 'readStatus', order: 7, group: 'reading', defaultVisible: true,
      defaultWidth: 132, kind: 'readStatus', value: book => book.readStatus},
  },
  {
    labelKey: 'book.fields.personalRating',
    facetKey: 'personal_rating',
    sort: {key: 'personalRating', group: 'common', defaultDirection: 'desc', kind: 'numeric'},
  },
  {
    labelKey: 'book.fields.amazonRating',
    facetKey: 'amazon_rating',
    sort: {key: 'amazonRating', group: 'more', defaultDirection: 'desc', kind: 'numeric'},
    column: {key: 'amazonRating', order: 15, group: 'ratings', defaultVisible: false,
      defaultWidth: 124, kind: 'rating', value: book => book.metadata?.amazonRating},
  },
  {
    labelKey: 'book.fields.amazonReviewCount',
    sort: {key: 'amazonReviewCount', group: 'more', defaultDirection: 'desc', kind: 'numeric'},
    column: {key: 'amazonReviewCount', order: 16, group: 'ratings', defaultVisible: false,
      defaultWidth: 132, kind: 'number', value: book => book.metadata?.amazonReviewCount},
  },
  {
    labelKey: 'book.fields.goodreadsRating',
    facetKey: 'goodreads_rating',
    sort: {key: 'goodreadsRating', group: 'more', defaultDirection: 'desc', kind: 'numeric'},
    column: {key: 'goodreadsRating', order: 17, group: 'ratings', defaultVisible: false,
      defaultWidth: 124, kind: 'rating', value: book => book.metadata?.goodreadsRating},
  },
  {
    labelKey: 'book.fields.goodreadsReviewCount',
    sort: {key: 'goodreadsReviewCount', group: 'more', defaultDirection: 'desc', kind: 'numeric'},
    column: {key: 'goodreadsReviewCount', order: 18, group: 'ratings', defaultVisible: false,
      defaultWidth: 132, kind: 'number', value: book => book.metadata?.goodreadsReviewCount},
  },
  {
    labelKey: 'book.fields.hardcoverRating',
    facetKey: 'hardcover_rating',
    sort: {key: 'hardcoverRating', group: 'more', defaultDirection: 'desc', kind: 'numeric'},
    column: {key: 'hardcoverRating', order: 19, group: 'ratings', defaultVisible: false,
      defaultWidth: 124, kind: 'rating', value: book => book.metadata?.hardcoverRating},
  },
  {
    labelKey: 'book.fields.hardcoverReviewCount',
    sort: {key: 'hardcoverReviewCount', group: 'more', defaultDirection: 'desc', kind: 'numeric'},
    column: {key: 'hardcoverReviewCount', order: 20, group: 'ratings', defaultVisible: false,
      defaultWidth: 132, kind: 'number', value: book => book.metadata?.hardcoverReviewCount},
  },
  {
    labelKey: 'book.fields.ranobedbRating',
    facetKey: 'ranobedb_rating',
    sort: {key: 'ranobedbRating', group: 'more', defaultDirection: 'desc', kind: 'numeric'},
    column: {key: 'ranobedbRating', order: 21, group: 'ratings', defaultVisible: false,
      defaultWidth: 124, kind: 'rating', value: book => book.metadata?.ranobedbRating},
  },
  {
    labelKey: 'book.fields.pageCount',
    facetKey: 'page_count',
    sort: {key: 'pageCount', group: 'more', defaultDirection: 'desc', kind: 'numeric'},
    column: {key: 'pageCount', order: 5, group: 'publishing', defaultVisible: true,
      defaultWidth: 104, kind: 'number', value: book => book.metadata?.pageCount},
  },
  {
    labelKey: 'book.fields.publishedDate',
    sort: {key: 'publishedDate', group: 'common', defaultDirection: 'desc', kind: 'calendar'},
    column: {key: 'publishedDate', order: 4, group: 'publishing', defaultVisible: true,
      defaultWidth: 132, kind: 'date', value: book => book.metadata?.publishedDate},
  },
  {
    labelKey: 'book.fields.publishedYear',
    facetKey: 'published_year',
  },
  {
    labelKey: 'book.fields.addedOn',
    sort: {key: 'addedOn', group: 'common', defaultDirection: 'desc', kind: 'calendar'},
    column: {key: 'addedOn', order: 9, group: 'reading', defaultVisible: false,
      defaultWidth: 132, kind: 'date', value: book => book.addedOn},
  },
  {
    labelKey: 'book.fields.lastReadTime',
    sort: {key: 'lastReadTime', group: 'common', defaultDirection: 'desc', kind: 'clock'},
    column: {key: 'lastReadTime', order: 8, group: 'reading', defaultVisible: false,
      defaultWidth: 132, kind: 'date', value: book => book.lastReadTime},
  },
  {
    labelKey: 'book.fields.dateFinished',
    sort: {key: 'dateFinished', group: 'more', defaultDirection: 'desc', kind: 'calendar'},
  },
  {
    labelKey: 'book.fields.readingProgress',
    sort: {key: 'readingProgress', group: 'common', defaultDirection: 'desc', kind: 'numeric'},
  },
  {
    labelKey: 'book.fields.fileName',
    column: {key: 'fileName', order: 12, group: 'file', defaultVisible: false,
      defaultWidth: 240, value: book => book.primaryFile?.fileName ?? ''},
  },
  {
    labelKey: 'book.fields.fileSize',
    facetKey: 'file_size',
    column: {key: 'fileSizeKb', order: 13, group: 'file', defaultVisible: false,
      defaultWidth: 112, kind: 'fileSize', value: book => book.primaryFile?.fileSizeKb},
  },
  {
    labelKey: 'book.fields.isbn',
    column: {key: 'isbn', order: 14, group: 'publishing', defaultVisible: false,
      defaultWidth: 150, value: book => book.metadata?.isbn13 ?? book.metadata?.isbn10 ?? ''},
  },
  {labelKey: 'book.fields.library', facetKey: 'library'},
  {labelKey: 'book.fields.shelf', facetKey: 'shelf'},
  {labelKey: 'book.fields.ageRating', facetKey: 'age_rating'},
  {labelKey: 'book.fields.contentRating', facetKey: 'content_rating'},
  {labelKey: 'book.fields.matchScore', facetKey: 'match_score'},
  {labelKey: 'book.fields.shelfStatus', facetKey: 'shelf_status'},
  {labelKey: 'book.fields.comicCharacter', facetKey: 'comic_character'},
  {labelKey: 'book.fields.comicTeam', facetKey: 'comic_team'},
  {labelKey: 'book.fields.comicLocation', facetKey: 'comic_location'},
  {labelKey: 'book.fields.comicCreator', facetKey: 'comic_creator'},
] as const satisfies readonly BookBrowseField[];

type SortKeyOf<Field> =
  Field extends {readonly sort: {readonly key: infer Key}} ? Key : never;
type FacetKeyOf<Field> =
  Field extends {readonly facetKey: infer Key} ? Key : never;
type ColumnKeyOf<Field> =
  Field extends {readonly column: {readonly key: infer Key}} ? Key : never;
export type BookBrowseColumnKey = ColumnKeyOf<(typeof FIELDS)[number]>;
export interface BookBrowseColumnOption {
  readonly field: BookBrowseColumnKey;
  readonly labelKey: string;
  readonly visible: boolean;
  readonly hideable: boolean;
}
export interface BookBrowseColumnSection {
  readonly id: BookBrowseColumnGroupId;
  readonly columns: readonly BookBrowseColumnOption[];
}
const COLUMN_ORDER: readonly BookBrowseColumnKey[] = FIELDS
  .flatMap(field => 'column' in field ? [field.column] : [])
  .sort((first, second) => first.order - second.order)
  .map(column => column.key);
type RegisteredSortFields = SortKeyOf<(typeof FIELDS)[number]>;
type RegisteredFacetFields = FacetKeyOf<(typeof FIELDS)[number]>;
type RegisteredColumnFields = ColumnKeyOf<(typeof FIELDS)[number]>;
type MissingSortFields = Exclude<BookQuerySortKey, RegisteredSortFields>;
type MissingFacetFields = Exclude<BookQueryFacetKey, RegisteredFacetFields>;
type MissingColumnFields = Exclude<BookBrowseColumnKey, RegisteredColumnFields>;
type MissingSortOrderKeys = Exclude<BookQuerySortKey, (typeof SORT_ORDER)[number]>;
type MissingFacetOrderKeys = Exclude<BookQueryFacetKey, (typeof FACET_ORDER)[number]>;
type AssertNever<Value extends never> = Value;
export type AssertAllBookBrowseFieldsRegistered = [
  AssertNever<MissingSortFields>,
  AssertNever<MissingFacetFields>,
  AssertNever<MissingColumnFields>,
  AssertNever<MissingSortOrderKeys>,
  AssertNever<MissingFacetOrderKeys>,
];

const SORT_ORDER = [
  'title',
  'seriesName',
  'addedOn',
  'lastReadTime',
  'publishedDate',
  'personalRating',
  'readingProgress',
  'publisher',
  'seriesNumber',
  'pageCount',
  'narrator',
  'language',
  'readStatus',
  'dateFinished',
  'amazonRating',
  'amazonReviewCount',
  'goodreadsRating',
  'goodreadsReviewCount',
  'hardcoverRating',
  'hardcoverReviewCount',
  'ranobedbRating',
] as const satisfies readonly BookQuerySortKey[];

const FACET_ORDER = [
  'author',
  'genre',
  'tag',
  'mood',
  'series',
  'publisher',
  'language',
  'file_type',
  'read_status',
  'personal_rating',
  'library',
  'shelf',
  'age_rating',
  'content_rating',
  'match_score',
  'published_year',
  'file_size',
  'page_count',
  'shelf_status',
  'amazon_rating',
  'goodreads_rating',
  'hardcover_rating',
  'ranobedb_rating',
  'comic_character',
  'comic_team',
  'comic_location',
  'comic_creator',
] as const satisfies readonly BookQueryFacetKey[];

const OPEN_RAIL_FACETS: ReadonlySet<BookQueryFacetKey> =
  new Set(['author', 'genre', 'tag', 'series']);

const COLUMN_GROUP_ORDER: readonly BookBrowseColumnGroupId[] = [
  'reading',
  'publishing',
  'file',
  'categorization',
  'ratings',
];

const FIELDS_BY_FACET = new Map<BookQueryFacetKey, BookBrowseField>(
  FIELDS.flatMap((field: BookBrowseField) =>
    field.facetKey ? [[field.facetKey, field] as const] : []),
);
const FIELDS_BY_SORT = new Map<BookQuerySortKey, BookBrowseField>(
  FIELDS.flatMap((field: BookBrowseField) =>
    field.sort ? [[field.sort.key, field] as const] : []),
);
const FIELDS_BY_COLUMN = new Map<string, BookBrowseField>(
  FIELDS.flatMap((field: BookBrowseField) =>
    field.column ? [[field.column.key, field] as const] : []),
);

function sortOption(
  key: BookQuerySortKey,
  directions: readonly SortDirection[],
): BookSortOption {
  const field = FIELDS_BY_SORT.get(key)!;
  const preferred = field.sort!.defaultDirection;
  return {
    id: key,
    labelKey: field.labelKey,
    group: field.sort!.group,
    defaultDirection: directions.includes(preferred) ? preferred : directions[0],
    directions,
  };
}

export function buildSortOptions(serverSortTokens: readonly string[]): BookSortOption[] {
  const directionsByKey = new Map<BookQuerySortKey, SortDirection[]>();
  for (const token of serverSortTokens) {
    const term = parseSortTermsToken(token)[0];
    if (!term) {
      continue;
    }
    const directions = directionsByKey.get(term.key) ?? [];
    directions.push(term.direction);
    directionsByKey.set(term.key, directions);
  }
  return SORT_ORDER.flatMap(key => {
    const directions = directionsByKey.get(key);
    return directions ? [sortOption(key, directions)] : [];
  });
}

export const DEFAULT_BOOK_SORT: BookSortSelection = {
  option: sortOption(
    DEFAULT_BOOK_SORT_TERMS[0].key,
    [DEFAULT_BOOK_SORT_TERMS[0].direction],
  ),
  direction: DEFAULT_BOOK_SORT_TERMS[0].direction,
};

export function parseSortToken(token: string | null): BookSortSelection | null {
  const first = parseSortTermsToken(token)[0];
  return first
    ? {option: sortOption(first.key, [first.direction]), direction: first.direction}
    : null;
}

export function sortTerms(selection: BookSortSelection): BookSortTerm[] {
  return [{key: selection.option.id, direction: selection.direction}];
}

export function bookBrowseSortLabelKey(key: BookQuerySortKey): string {
  const field = FIELDS_BY_SORT.get(key)!;
  return field.labelKey;
}

export function sortDirectionIcon(
  key: BookQuerySortKey,
  direction: SortDirection,
): LucideIconData {
  const ascending = direction === 'asc';
  const kind = FIELDS_BY_SORT.get(key)!.sort!.kind;

  switch (kind) {
    case 'alphabetical':
      return ascending ? LucideArrowUpAZ.icon : LucideArrowDownZA.icon;
    case 'numeric':
      return ascending ? LucideArrowUp01.icon : LucideArrowDown10.icon;
    case 'calendar':
      return ascending ? LucideCalendarArrowUp.icon : LucideCalendarArrowDown.icon;
    case 'clock':
      return ascending ? LucideClockArrowUp.icon : LucideClockArrowDown.icon;
  }
}

export function bookBrowseSortLineAvailable(key: BookQuerySortKey): boolean {
  const field = FIELDS_BY_SORT.get(key);
  return field?.sort != null && field.sort.showOnCard !== false;
}

export function bookBrowseFacetLabelKey(key: BookQueryFacetKey): string {
  const field = FIELDS_BY_FACET.get(key)!;
  return field.labelKey;
}

const READ_STATUS_LABEL_KEYS: Partial<Record<NonNullable<BookSummary['readStatus']>, string>> = {
  UNREAD: 'unread',
  READING: 'reading',
  RE_READING: 'reReading',
  READ: 'read',
  PARTIALLY_READ: 'partiallyRead',
  PAUSED: 'paused',
  WONT_READ: 'wontRead',
  ABANDONED: 'abandoned',
};

export function bookReadStatusLabelKey(status: BookSummary['readStatus']): string | null {
  const key = status && status !== 'UNSET' ? READ_STATUS_LABEL_KEYS[status] : undefined;
  return key ? `book.filter.readStatus.${key}` : null;
}

export function freezeFacetOrders(served: readonly BookFacetGroup[]): FrozenFacetOrders {
  return Object.fromEntries(
    served
      .filter(group => isBookQueryFacetKey(group.key))
      .map(group => [group.key, {
        values: group.values.map(value => ({value: value.value, label: value.title})),
      }] as const),
  );
}

export function orderedFacetVocabularyKeys(
  served: readonly BookFacetGroup[],
  frozen?: FrozenFacetOrders,
): BookQueryFacetKey[] {
  const available = new Set<string>(Object.keys(frozen ?? {}));
  served.forEach(group => available.add(group.key));
  return FACET_ORDER.filter(key => available.has(key));
}

export function buildRailGroups(
  served: readonly BookFacetGroup[],
  frozen?: FrozenFacetOrders,
): FilterRailGroup<BookQueryFacetKey>[] {
  const byKey = new Map(
    served
      .filter(group => isBookQueryFacetKey(group.key))
      .map(group => [group.key, group]),
  );
  const groups: FilterRailGroup<BookQueryFacetKey>[] = [];
  for (const key of orderedFacetVocabularyKeys(served, frozen)) {
    const servedGroup = byKey.get(key);
    const frozenGroup = frozen && Object.hasOwn(frozen, key) ? frozen[key] : undefined;
    const labelKey = bookBrowseFacetLabelKey(key);
    if (!frozenGroup) {
      if (!servedGroup) {
        continue;
      }
      groups.push({
        key,
        labelKey,
        defaultOpen: OPEN_RAIL_FACETS.has(key),
        values: servedGroup.values.map(value => ({
          value: value.value,
          label: value.title,
          count: value.count,
          selected: value.selected,
        })),
      });
      continue;
    }

    const counts = new Map((servedGroup?.values ?? []).map(value => [value.value, value.count]));
    const selected = new Set(
      (servedGroup?.values ?? []).filter(value => value.selected).map(value => value.value),
    );
    const known = new Set(frozenGroup.values.map(value => value.value));
    const values = frozenGroup.values.map(frozenValue => ({
      value: frozenValue.value,
      label: frozenValue.label,
      count: counts.get(frozenValue.value) ?? 0,
      selected: selected.has(frozenValue.value),
    }));
    for (const value of servedGroup?.values ?? []) {
      if (!known.has(value.value)) {
        values.push({
          value: value.value,
          label: value.title,
          count: value.count,
          selected: value.selected,
        });
      }
    }
    const ordered = [
      ...values.filter(item => item.count !== 0 || item.selected),
      ...values.filter(item => item.count === 0 && !item.selected),
    ];
    groups.push({
      key,
      labelKey,
      defaultOpen: OPEN_RAIL_FACETS.has(key),
      values: ordered,
    });
  }
  return groups;
}

export function normalizeBookBrowseColumnPreferences(
  saved: readonly TableColumnPreference[] | undefined,
): TableColumnPreference[] {
  const savedByField = new Map(saved?.map(preference => [preference.field, preference]));
  return COLUMN_ORDER.map((field, order) => {
    const definition = FIELDS_BY_COLUMN.get(field)!.column!;
    const preference = savedByField.get(field);
    return {
      field,
      visible: definition.hideable === false
        || (preference?.visible ?? definition.defaultVisible),
      order: preference?.order ?? order,
    };
  });
}

export function bookBrowseColumnOptions(
  preferences: readonly TableColumnPreference[],
): BookBrowseColumnOption[] {
  const visibleByField = new Map(
    preferences.map(preference => [preference.field, preference.visible]),
  );
  return COLUMN_ORDER.map(field => {
    const definition = FIELDS_BY_COLUMN.get(field);
    if (!definition?.column) {
      throw new Error(`Missing browse field for column: ${field}`);
    }
    return {
      field,
      labelKey: definition.labelKey,
      visible: definition.column.hideable === false || visibleByField.get(field) === true,
      hideable: definition.column.hideable !== false,
    };
  });
}

export function bookBrowseVisibleColumnOptions(
  preferences: readonly TableColumnPreference[],
): BookBrowseColumnOption[] {
  const optionsByField = new Map(
    bookBrowseColumnOptions(preferences).map(option => [option.field, option]),
  );
  return [...preferences]
    .filter(preference => preference.visible)
    .sort((first, second) => first.order - second.order)
    .flatMap(preference => {
      const option = optionsByField.get(preference.field as BookBrowseColumnKey);
      return option ? [option] : [];
    });
}

export function bookBrowseColumnSections(
  options: readonly BookBrowseColumnOption[],
): BookBrowseColumnSection[] {
  const optionsByField = new Map(options.map(option => [option.field, option]));
  return COLUMN_GROUP_ORDER.map(id => ({
    id,
    columns: COLUMN_ORDER.flatMap(field => {
      const definition = FIELDS_BY_COLUMN.get(field)?.column;
      const option = optionsByField.get(field);
      return definition?.group === id && option ? [option] : [];
    }),
  }));
}

export function bookBrowseSortableColumnFields(
  sortOptions: readonly BookSortOption[],
): ReadonlySet<string> {
  const advertised = new Set(sortOptions.map(option => option.id));
  return new Set(
    FIELDS.flatMap((field: BookBrowseField) =>
      field.column && field.sort && advertised.has(field.sort.key)
        ? [field.column.key]
        : [],
    ),
  );
}

export function bookBrowseColumnSortDescFirst(field: string): boolean {
  return FIELDS_BY_COLUMN.get(field)?.sort?.defaultDirection === 'desc';
}

export function bookBrowseColumnKind(field: string): BookBrowseColumnKind {
  return FIELDS_BY_COLUMN.get(field)?.column?.kind ?? 'text';
}

export function bookBrowseColumnDefaultWidth(field: BookBrowseColumnKey): number {
  return FIELDS_BY_COLUMN.get(field)!.column!.defaultWidth;
}

export function bookBrowseColumnValue(
  book: BookSummary,
  field: string,
): BookBrowseColumnValue {
  return FIELDS_BY_COLUMN.get(field)?.column?.value(book);
}

export function bookBrowseFacetLinks(
  book: BookSummary,
  columnField: string,
): readonly BookBrowseFacetLink[] {
  const field = FIELDS_BY_COLUMN.get(columnField);
  if (!field?.facetKey || !field.facetValues) {
    return [];
  }
  return field.facetValues(book).map(value => ({key: field.facetKey!, value}));
}
