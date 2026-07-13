export const METADATA_REFRESH_FIELDS = [
  'title',
  'subtitle',
  'description',
  'authors',
  'publisher',
  'publishedDate',
  'seriesName',
  'seriesNumber',
  'seriesTotal',
  'isbn13',
  'isbn10',
  'language',
  'categories',
  'cover',
  'pageCount',
  'asin',
  'amazonRating',
  'amazonReviewCount',
  'googleId',
  'goodreadsId',
  'goodreadsRating',
  'goodreadsReviewCount',
  'hardcoverId',
  'hardcoverBookId',
  'hardcoverRating',
  'hardcoverReviewCount',
  'moods',
  'tags',
  'comicvineId',
  'lubimyczytacId',
  'lubimyczytacRating',
  'ranobedbId',
  'ranobedbRating',
  'audibleId',
  'audibleRating',
  'audibleReviewCount',
] as const;

export const METADATA_REFRESH_PROVIDERS = [
  'amazon',
  'goodreads',
  'google',
  'hardcover',
  'comicvine',
  'douban',
  'lubimyczytac',
  'ranobedb',
  'audible',
] as const;

export type MetadataRefreshField = typeof METADATA_REFRESH_FIELDS[number];
export type MetadataRefreshProvider = typeof METADATA_REFRESH_PROVIDERS[number];
export type MetadataRefreshReplaceMode = 'all' | 'missing' | 'provided';

export type MetadataRefreshTarget =
  | {readonly kind: 'books'; readonly bookIds: readonly number[]}
  | {readonly kind: 'library'; readonly libraryId: number};

export interface MetadataRefreshPreferences {
  readonly refreshCovers: boolean;
  readonly mergeCategories: boolean;
  readonly reviewBeforeApply: boolean;
  readonly replaceMode: MetadataRefreshReplaceMode;
  readonly providersByField: Readonly<Record<MetadataRefreshField, readonly MetadataRefreshProvider[]>>;
  readonly enabledFields: Readonly<Record<MetadataRefreshField, boolean>>;
}

export interface RefreshMetadataVariables {
  readonly target: MetadataRefreshTarget;
  readonly preferences?: MetadataRefreshPreferences;
}

export interface RefreshMetadataResult {
  readonly target: MetadataRefreshTarget;
}
