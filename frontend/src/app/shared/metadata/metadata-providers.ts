const providers = [
  {
    id: 'OpenLibrary',
    settingsKey: 'openLibrary',
    labelKey: 'metadata.providers.openLibrary',
    book: {ids: ['openlibraryId']},
  },
  {
    id: 'Amazon',
    settingsKey: 'amazon',
    labelKey: 'metadata.providers.amazon',
    supportsReviews: true,
    book: {ids: ['asin'], rating: 'amazonRating', reviewCount: 'amazonReviewCount', labelKeys: {asin: 'metadata.providerFields.asin'}},
  },
  {
    id: 'GoodReads',
    settingsKey: 'goodReads',
    labelKey: 'metadata.providers.goodReads',
    supportsReviews: true,
    book: {ids: ['goodreadsId'], rating: 'goodreadsRating', reviewCount: 'goodreadsReviewCount'},
  },
  {
    id: 'Google',
    settingsKey: 'google',
    labelKey: 'metadata.providers.google',
    book: {ids: ['googleId']},
  },
  {
    id: 'Hardcover',
    settingsKey: 'hardcover',
    labelKey: 'metadata.providers.hardcover',
    book: {ids: ['hardcoverId', 'hardcoverBookId'], rating: 'hardcoverRating', reviewCount: 'hardcoverReviewCount', labelKeys: {hardcoverBookId: 'metadata.providerFields.hardcoverBookId'}},
  },
  {
    id: 'Comicvine',
    settingsKey: 'comicvine',
    labelKey: 'metadata.providers.comicvine',
    book: {ids: ['comicvineId']},
  },
  {
    id: 'Douban',
    settingsKey: 'douban',
    labelKey: 'metadata.providers.douban',
    supportsReviews: true,
  },
  {
    id: 'Lubimyczytac',
    settingsKey: 'lubimyczytac',
    labelKey: 'metadata.providers.lubimyczytac',
    book: {ids: ['lubimyczytacId'], rating: 'lubimyczytacRating'},
  },
  {
    id: 'Ranobedb',
    settingsKey: 'ranobedb',
    labelKey: 'metadata.providers.ranobedb',
    book: {ids: ['ranobedbId'], rating: 'ranobedbRating'},
  },
  {
    id: 'Audible',
    settingsKey: 'audible',
    labelKey: 'metadata.providers.audible',
    book: {ids: ['audibleId'], rating: 'audibleRating', reviewCount: 'audibleReviewCount'},
  },
  {
    id: 'AppleBooks',
    settingsKey: 'appleBooks',
    labelKey: 'metadata.providers.appleBooks',
    book: {ids: ['applebooksId'], rating: 'applebooksRating', reviewCount: 'applebooksReviewCount'},
  },
] as const;

export type MetadataProviderId = typeof providers[number]['id'];

type BookAspect = Extract<typeof providers[number], {book: unknown}>['book'];
type FieldForRole<Aspect, Role extends string> = Aspect extends Record<Role, infer Name extends string> ? Name : never;

type IdFieldName = BookAspect['ids'][number];
type RatingFieldName = FieldForRole<BookAspect, 'rating'>;
type ReviewCountFieldName = FieldForRole<BookAspect, 'reviewCount'>;

export type MetadataProviderFieldName = IdFieldName | RatingFieldName | ReviewCountFieldName;

export interface MetadataProviderBookFields {
  readonly ids: readonly IdFieldName[];
  readonly rating?: RatingFieldName;
  readonly reviewCount?: ReviewCountFieldName;
  readonly labelKeys?: Partial<Record<MetadataProviderFieldName, string>>;
}

export interface MetadataProviderDescriptor {
  readonly id: MetadataProviderId;
  readonly settingsKey: Uncapitalize<MetadataProviderId>;
  readonly labelKey: string;
  readonly supportsReviews?: boolean;
  readonly book?: MetadataProviderBookFields;
}

export const METADATA_PROVIDER_LIST: readonly MetadataProviderDescriptor[] = providers;
