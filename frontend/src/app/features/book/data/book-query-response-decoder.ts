import {
  BookFacetGroup,
  BookPage,
  decodeFacetGroups,
  FacetGroupsResponse,
} from './book-query.models';
import {
  BookDetail,
  BookRecommendation,
  BookSummary,
} from './book-response.models';

type JsonRecord = Record<string, unknown>;
type Validator = (value: unknown, path: string) => void;

const BOOK_FILE_TYPES = ['PDF', 'EPUB', 'CBX', 'FB2', 'MOBI', 'AZW3', 'AUDIOBOOK'] as const;
const BOOK_ARCHIVE_TYPES = ['ZIP', 'RAR', 'SEVEN_ZIP', 'UNKNOWN'] as const;
const BOOK_READ_STATUSES = [
  'UNREAD',
  'READING',
  'RE_READING',
  'READ',
  'PARTIALLY_READ',
  'PAUSED',
  'WONT_READ',
  'ABANDONED',
  'UNSET',
] as const;
const BOOK_METADATA_PROVIDERS = [
  'Amazon',
  'GoodReads',
  'Google',
  'Hardcover',
  'Comicvine',
  'Douban',
  'Lubimyczytac',
  'Ranobedb',
  'Audible',
] as const;

const BASE_METADATA_STRING_FIELDS = [
  'title',
  'publisher',
  'publishedDate',
  'seriesName',
  'isbn13',
  'isbn10',
  'language',
  'narrator',
  'coverUpdatedOn',
  'audiobookCoverUpdatedOn',
  'contentRating',
] as const;
const BASE_METADATA_NUMBER_FIELDS = [
  'seriesNumber',
  'pageCount',
  'amazonRating',
  'amazonReviewCount',
  'goodreadsRating',
  'goodreadsReviewCount',
  'hardcoverRating',
  'hardcoverReviewCount',
  'ranobedbRating',
  'rating',
  'ageRating',
] as const;
const BASE_METADATA_STRING_ARRAY_FIELDS = ['authors', 'categories', 'moods', 'tags'] as const;
const DETAIL_METADATA_STRING_FIELDS = [
  'subtitle',
  'description',
  'asin',
  'goodreadsId',
  'comicvineId',
  'hardcoverId',
  'hardcoverBookId',
  'doubanId',
  'googleId',
  'lubimyczytacId',
  'ranobedbId',
  'audibleId',
  'externalUrl',
  'thumbnailUrl',
] as const;
const DETAIL_METADATA_NUMBER_FIELDS = [
  'seriesTotal',
  'doubanRating',
  'doubanReviewCount',
  'lubimyczytacRating',
  'audibleRating',
  'audibleReviewCount',
] as const;
const DETAIL_METADATA_BOOLEAN_FIELDS = [
  'abridged',
  'titleLocked',
  'subtitleLocked',
  'publisherLocked',
  'publishedDateLocked',
  'descriptionLocked',
  'seriesNameLocked',
  'seriesNumberLocked',
  'seriesTotalLocked',
  'isbn13Locked',
  'isbn10Locked',
  'asinLocked',
  'goodreadsIdLocked',
  'comicvineIdLocked',
  'hardcoverIdLocked',
  'hardcoverBookIdLocked',
  'doubanIdLocked',
  'googleIdLocked',
  'pageCountLocked',
  'languageLocked',
  'amazonRatingLocked',
  'amazonReviewCountLocked',
  'goodreadsRatingLocked',
  'goodreadsReviewCountLocked',
  'hardcoverRatingLocked',
  'hardcoverReviewCountLocked',
  'doubanRatingLocked',
  'doubanReviewCountLocked',
  'lubimyczytacIdLocked',
  'lubimyczytacRatingLocked',
  'ranobedbIdLocked',
  'ranobedbRatingLocked',
  'audibleIdLocked',
  'audibleRatingLocked',
  'audibleReviewCountLocked',
  'externalUrlLocked',
  'coverLocked',
  'audiobookCoverLocked',
  'authorsLocked',
  'categoriesLocked',
  'moodsLocked',
  'tagsLocked',
  'reviewsLocked',
  'narratorLocked',
  'abridgedLocked',
  'ageRatingLocked',
  'contentRatingLocked',
] as const;
const AUDIOBOOK_NUMBER_FIELDS = [
  'durationSeconds',
  'bitrate',
  'sampleRate',
  'channels',
  'chapterCount',
] as const;
const COMIC_STRING_ARRAY_FIELDS = [
  'pencillers',
  'inkers',
  'colorists',
  'letterers',
  'coverArtists',
  'editors',
  'characters',
  'teams',
  'locations',
] as const;
const DETAIL_COMIC_STRING_FIELDS = [
  'issueNumber',
  'volumeName',
  'storyArc',
  'alternateSeries',
  'alternateIssue',
  'imprint',
  'format',
  'readingDirection',
  'webLink',
  'notes',
] as const;
const DETAIL_COMIC_NUMBER_FIELDS = ['volumeNumber', 'storyArcNumber'] as const;
const DETAIL_COMIC_BOOLEAN_FIELDS = [
  'blackAndWhite',
  'manga',
  'issueNumberLocked',
  'volumeNameLocked',
  'volumeNumberLocked',
  'storyArcLocked',
  'storyArcNumberLocked',
  'alternateSeriesLocked',
  'alternateIssueLocked',
  'imprintLocked',
  'formatLocked',
  'blackAndWhiteLocked',
  'mangaLocked',
  'readingDirectionLocked',
  'webLinkLocked',
  'notesLocked',
  'creatorsLocked',
  'pencillersLocked',
  'inkersLocked',
  'coloristsLocked',
  'letterersLocked',
  'coverArtistsLocked',
  'editorsLocked',
  'charactersLocked',
  'teamsLocked',
  'locationsLocked',
] as const;

export function decodeBookPage(value: unknown): BookPage {
  const response = record(value, 'page');
  const content = array(required(response, 'content', 'page'), 'page.content');
  const decodedContent = content.map((book, index) => decodeBookSummary(
    book,
    `page.content[${index}]`,
  ));

  const metadata = record(required(response, 'page', 'page'), 'page.page');
  requiredNumberField(metadata, 'number', 'page.page', true);
  requiredNumberField(metadata, 'size', 'page.page', true);
  requiredNumberField(metadata, 'totalElements', 'page.page', true);
  requiredNumberField(metadata, 'totalPages', 'page.page', true);
  optionalField(metadata, 'cursor', 'page.page', stringValue);

  const links = array(required(response, 'links', 'page'), 'page.links');
  const decodedLinks = links.map((link, index) => {
    const path = `page.links[${index}]`;
    const item = record(link, path);
    stringArray(required(item, 'rel', path), `${path}.rel`);
    requiredField(item, 'href', path, stringValue);
    requiredField(item, 'type', path, stringValue);
    return pickFields(item, ['rel', 'href', 'type'] as const);
  });

  return {
    content: decodedContent,
    page: pickFields(metadata, [
      'number',
      'size',
      'totalElements',
      'totalPages',
      'cursor',
    ] as const),
    links: decodedLinks,
  } as unknown as BookPage;
}

export function decodeBookFacetGroups(value: unknown): BookFacetGroup[] {
  const response = record(value, 'facets');
  const facets = array(required(response, 'facets', 'facets'), 'facets.facets');
  facets.forEach((facet, facetIndex) => {
    const path = `facets.facets[${facetIndex}]`;
    const group = record(facet, path);
    const metadata = record(required(group, 'metadata', path), `${path}.metadata`);
    requiredField(metadata, 'rel', `${path}.metadata`, stringValue);
    requiredField(metadata, 'key', `${path}.metadata`, stringValue);
    requiredField(metadata, 'title', `${path}.metadata`, stringValue);
    const links = array(required(group, 'links', path), `${path}.links`);
    links.forEach((link, linkIndex) => {
      const linkPath = `${path}.links[${linkIndex}]`;
      const item = record(link, linkPath);
      for (const field of ['rel', 'href', 'type', 'title', 'value'] as const) {
        requiredField(item, field, linkPath, stringValue);
      }
      optionalObject(item, 'properties', linkPath, (properties, propertiesPath) => {
        optionalField(properties, 'numberOfItems', propertiesPath, numberValue);
      });
    });
  });

  return decodeFacetGroups(value as FacetGroupsResponse);
}

export function decodeBookIds(value: unknown): number[] {
  const ids = array(value, 'ids');
  const seen = new Set<number>();
  return ids.map((value, index) => {
    const path = `ids[${index}]`;
    const id = positiveInteger(value, path);
    if (seen.has(id)) {
      invalid(path, `duplicate book ID ${id}`);
    }
    seen.add(id);
    return id;
  });
}

export function decodeBookDetail(value: unknown, expectedBookId: number): BookDetail {
  return decodeBookDetailAt(value, 'detail', expectedBookId);
}

export function decodeBookBatch(value: unknown, expectedBookIds: readonly number[]): BookDetail[] {
  const books = array(value, 'batch');
  const expected = new Set(expectedBookIds);
  const seen = new Set<number>();
  const decodedBooks = books.map((book, index) => {
    const path = `batch[${index}]`;
    const item = record(book, path);
    const id = positiveInteger(required(item, 'id', path), `${path}.id`);
    if (!expected.has(id)) {
      invalid(`${path}.id`, `unexpected book ID ${id}`);
    }
    if (seen.has(id)) {
      invalid(`${path}.id`, `duplicate book ID ${id}`);
    }
    const decoded = decodeBookDetailAt(item, path, id);
    seen.add(id);
    return decoded;
  });

  const missing = expectedBookIds.find(id => !seen.has(id));
  if (missing !== undefined) {
    invalid('batch', `missing requested book ID ${missing}`);
  }
  return decodedBooks;
}

export function decodeBookRecommendations(value: unknown, sourceBookId: number): BookRecommendation[] {
  const recommendations = array(value, 'recommendations');
  const seen = new Set<number>();
  return recommendations.map((recommendation, index) => {
    const path = `recommendations[${index}]`;
    const item = record(recommendation, path);
    const book = record(required(item, 'book', path), `${path}.book`);
    const id = positiveInteger(required(book, 'id', `${path}.book`), `${path}.book.id`);
    if (id === sourceBookId) {
      invalid(`${path}.book.id`, `recommendation cannot be the source book ${sourceBookId}`);
    }
    if (seen.has(id)) {
      invalid(`${path}.book.id`, `duplicate recommendation book ID ${id}`);
    }
    const decodedBook = decodeBookDetailAt(book, `${path}.book`, id);
    requiredField(item, 'similarityScore', path, numberValue);
    seen.add(id);
    return {
      book: decodedBook,
      similarityScore: item['similarityScore'],
    } as BookRecommendation;
  });
}

function decodeBookSummary(value: unknown, path: string): BookSummary {
  const book = validateBookFields(value, path);
  let decodedMetadata: JsonRecord | undefined;
  optionalObject(book, 'metadata', path, (metadata, metadataPath) => {
    validateBaseMetadata(metadata, metadataPath, positiveInteger(book['id'], `${path}.id`));
    requiredField(metadata, 'allMetadataLocked', metadataPath, booleanValue);
    optionalObject(metadata, 'audiobookMetadata', metadataPath, validateSummaryAudiobookMetadata);
    optionalObject(metadata, 'comicMetadata', metadataPath, validateSummaryComicMetadata);
    decodedMetadata = cleanSummaryMetadata(metadata);
  });
  return cleanBookFields(book, decodedMetadata) as unknown as BookSummary;
}

function decodeBookDetailAt(value: unknown, path: string, expectedBookId: number): BookDetail {
  const book = validateBookFields(value, path);
  const id = positiveInteger(book['id'], `${path}.id`);
  if (id !== expectedBookId) {
    invalid(`${path}.id`, `expected book ID ${expectedBookId}`);
  }
  let decodedMetadata: JsonRecord | undefined;
  optionalObject(book, 'metadata', path, (metadata, metadataPath) => {
    validateBaseMetadata(metadata, metadataPath, id);
    for (const field of DETAIL_METADATA_STRING_FIELDS) {
      optionalField(metadata, field, metadataPath, stringValue);
    }
    for (const field of DETAIL_METADATA_NUMBER_FIELDS) {
      optionalField(metadata, field, metadataPath, numberValue);
    }
    for (const field of DETAIL_METADATA_BOOLEAN_FIELDS) {
      optionalField(metadata, field, metadataPath, booleanValue);
    }
    optionalField(metadata, 'provider', metadataPath, enumValue(BOOK_METADATA_PROVIDERS));
    optionalObject(metadata, 'audiobookMetadata', metadataPath, validateDetailAudiobookMetadata);
    optionalObject(metadata, 'comicMetadata', metadataPath, validateDetailComicMetadata);
    decodedMetadata = cleanDetailMetadata(metadata);
  });
  let decodedLibraryPath: JsonRecord | undefined;
  optionalObject(book, 'libraryPath', path, (libraryPath, libraryPathName) => {
    requiredField(libraryPath, 'id', libraryPathName, positiveInteger);
    decodedLibraryPath = pickFields(libraryPath, ['id'] as const);
  });
  return cleanBookFields(book, decodedMetadata, decodedLibraryPath) as unknown as BookDetail;
}

function validateBookFields(value: unknown, path: string): JsonRecord {
  const book = record(value, path);
  const id = positiveInteger(required(book, 'id', path), `${path}.id`);
  requiredField(book, 'libraryId', path, positiveInteger);
  requiredField(book, 'libraryName', path, stringValue);
  for (const field of ['lastReadTime', 'addedOn', 'dateFinished'] as const) {
    optionalField(book, field, path, stringValue);
  }
  for (const field of ['metadataMatchScore', 'personalRating'] as const) {
    optionalField(book, field, path, numberValue);
  }
  optionalField(book, 'readStatus', path, enumValue(BOOK_READ_STATUSES));
  optionalField(book, 'isPhysical', path, booleanValue);
  optionalObject(book, 'primaryFile', path, (file, filePath) => validateBookFile(file, filePath, id));
  optionalArray(book, 'alternativeFormats', path, (file, filePath) => validateBookFile(record(file, filePath), filePath, id));
  optionalArray(book, 'supplementaryFiles', path, (file, filePath) => validateBookFile(record(file, filePath), filePath, id));
  optionalArray(book, 'shelves', path, validateShelf);
  optionalObject(book, 'pdfProgress', path, (progress, progressPath) => {
    requiredNullableField(progress, 'page', progressPath, numberValue);
    requiredNullableField(progress, 'percentage', progressPath, numberValue);
  });
  optionalObject(book, 'epubProgress', path, (progress, progressPath) => {
    requiredNullableField(progress, 'cfi', progressPath, stringValue);
    requiredNullableField(progress, 'href', progressPath, stringValue);
    requiredNullableField(progress, 'contentSourceProgressPercent', progressPath, numberValue);
    requiredNullableField(progress, 'percentage', progressPath, numberValue);
    requiredNullableField(progress, 'ttsPositionCfi', progressPath, stringValue);
  });
  optionalObject(book, 'cbxProgress', path, (progress, progressPath) => {
    requiredNullableField(progress, 'page', progressPath, numberValue);
    requiredNullableField(progress, 'percentage', progressPath, numberValue);
  });
  optionalObject(book, 'audiobookProgress', path, (progress, progressPath) => {
    for (const field of ['positionMs', 'trackIndex', 'trackPositionMs', 'percentage'] as const) {
      requiredNullableField(progress, field, progressPath, numberValue);
    }
  });
  for (const progressName of ['koreaderProgress', 'koboProgress'] as const) {
    optionalObject(book, progressName, path, (progress, progressPath) => {
      requiredNullableField(progress, 'percentage', progressPath, numberValue);
    });
  }
  return book;
}

function validateBookFile(file: JsonRecord, path: string, expectedBookId: number): void {
  requiredField(file, 'id', path, positiveInteger);
  const bookId = positiveInteger(required(file, 'bookId', path), `${path}.bookId`);
  if (bookId !== expectedBookId) {
    invalid(`${path}.bookId`, `expected book ID ${expectedBookId}`);
  }
  requiredField(file, 'book', path, booleanValue);
  requiredField(file, 'folderBased', path, booleanValue);
  for (const field of ['fileName', 'filePath', 'fileSubPath', 'extension', 'description', 'addedOn'] as const) {
    optionalField(file, field, path, stringValue);
  }
  optionalField(file, 'bookType', path, enumValue(BOOK_FILE_TYPES));
  optionalField(file, 'archiveType', path, enumValue(BOOK_ARCHIVE_TYPES));
  optionalField(file, 'fileSizeKb', path, numberValue);
}

function validateShelf(shelf: unknown, path: string): void {
  const item = record(shelf, path);
  optionalField(item, 'id', path, positiveInteger);
  requiredField(item, 'name', path, stringValue);
  optionalField(item, 'icon', path, stringValue);
  optionalField(item, 'iconType', path, enumValue(['LUCIDE', 'CUSTOM_SVG'] as const));
  optionalField(item, 'userId', path, positiveInteger);
  requiredField(item, 'publicShelf', path, booleanValue);
  requiredField(item, 'bookCount', path, nonNegativeInteger);
  optionalObject(item, 'sort', path, (sort, sortPath) => {
    requiredNullableField(sort, 'field', sortPath, stringValue);
    requiredNullableField(sort, 'direction', sortPath, shelfSortDirection);
  });
}

function validateBaseMetadata(metadata: JsonRecord, path: string, expectedBookId: number): void {
  const bookId = positiveInteger(required(metadata, 'bookId', path), `${path}.bookId`);
  if (bookId !== expectedBookId) {
    invalid(`${path}.bookId`, `expected book ID ${expectedBookId}`);
  }
  for (const field of BASE_METADATA_STRING_FIELDS) {
    optionalField(metadata, field, path, stringValue);
  }
  for (const field of BASE_METADATA_NUMBER_FIELDS) {
    optionalField(metadata, field, path, numberValue);
  }
  for (const field of BASE_METADATA_STRING_ARRAY_FIELDS) {
    optionalField(metadata, field, path, stringArray);
  }
  optionalField(metadata, 'isFixedLayout', path, booleanValue);
}

function validateSummaryAudiobookMetadata(metadata: JsonRecord, path: string): void {
  for (const field of AUDIOBOOK_NUMBER_FIELDS) {
    optionalField(metadata, field, path, numberValue);
  }
  optionalField(metadata, 'codec', path, stringValue);
}

function validateDetailAudiobookMetadata(metadata: JsonRecord, path: string): void {
  validateSummaryAudiobookMetadata(metadata, path);
  optionalArray(metadata, 'chapters', path, (chapter, chapterPath) => {
    const item = record(chapter, chapterPath);
    optionalField(item, 'index', chapterPath, numberValue);
    optionalField(item, 'title', chapterPath, stringValue);
    for (const field of ['startTimeMs', 'endTimeMs', 'durationMs'] as const) {
      optionalField(item, field, chapterPath, numberValue);
    }
  });
}

function validateSummaryComicMetadata(metadata: JsonRecord, path: string): void {
  for (const field of COMIC_STRING_ARRAY_FIELDS) {
    optionalField(metadata, field, path, stringArray);
  }
}

function validateDetailComicMetadata(metadata: JsonRecord, path: string): void {
  validateSummaryComicMetadata(metadata, path);
  for (const field of DETAIL_COMIC_STRING_FIELDS) {
    optionalField(metadata, field, path, stringValue);
  }
  for (const field of DETAIL_COMIC_NUMBER_FIELDS) {
    optionalField(metadata, field, path, numberValue);
  }
  for (const field of DETAIL_COMIC_BOOLEAN_FIELDS) {
    optionalField(metadata, field, path, booleanValue);
  }
}

function cleanBookFields(
  book: JsonRecord,
  metadata?: JsonRecord,
  libraryPath?: JsonRecord,
): JsonRecord {
  const decoded = pickFields(book, [
    'id',
    'libraryId',
    'libraryName',
    'lastReadTime',
    'addedOn',
    'metadataMatchScore',
    'personalRating',
    'readStatus',
    'dateFinished',
    'isPhysical',
  ] as const);
  if (metadata !== undefined) {
    decoded['metadata'] = metadata;
  }
  if (libraryPath !== undefined) {
    decoded['libraryPath'] = libraryPath;
  }
  if (Object.hasOwn(book, 'primaryFile')) {
    decoded['primaryFile'] = cleanBookFile(book['primaryFile'] as JsonRecord);
  }
  for (const field of ['alternativeFormats', 'supplementaryFiles'] as const) {
    if (Object.hasOwn(book, field)) {
      decoded[field] = (book[field] as JsonRecord[]).map(cleanBookFile);
    }
  }
  if (Object.hasOwn(book, 'shelves')) {
    decoded['shelves'] = (book['shelves'] as JsonRecord[]).map(cleanShelf);
  }
  const progressFields: Readonly<Record<string, readonly string[]>> = {
    pdfProgress: ['page', 'percentage'],
    epubProgress: [
      'cfi',
      'href',
      'contentSourceProgressPercent',
      'percentage',
      'ttsPositionCfi',
    ],
    cbxProgress: ['page', 'percentage'],
    audiobookProgress: ['positionMs', 'trackIndex', 'trackPositionMs', 'percentage'],
    koreaderProgress: ['percentage'],
    koboProgress: ['percentage'],
  };
  for (const [field, fields] of Object.entries(progressFields)) {
    if (Object.hasOwn(book, field)) {
      decoded[field] = pickFields(book[field] as JsonRecord, fields);
    }
  }
  return decoded;
}

function cleanBookFile(file: JsonRecord): JsonRecord {
  return pickFields(file, [
    'id',
    'bookId',
    'fileName',
    'filePath',
    'fileSubPath',
    'book',
    'folderBased',
    'bookType',
    'archiveType',
    'fileSizeKb',
    'extension',
    'description',
    'addedOn',
  ] as const);
}

function cleanShelf(shelf: JsonRecord): JsonRecord {
  const decoded = pickFields(shelf, [
    'id',
    'name',
    'icon',
    'iconType',
    'userId',
    'publicShelf',
    'bookCount',
  ] as const);
  if (Object.hasOwn(shelf, 'sort')) {
    decoded['sort'] = pickFields(shelf['sort'] as JsonRecord, ['field', 'direction'] as const);
  }
  return decoded;
}

function cleanSummaryMetadata(metadata: JsonRecord): JsonRecord {
  const decoded = cleanBaseMetadata(metadata);
  decoded['allMetadataLocked'] = metadata['allMetadataLocked'];
  if (Object.hasOwn(metadata, 'audiobookMetadata')) {
    decoded['audiobookMetadata'] = cleanSummaryAudiobookMetadata(
      metadata['audiobookMetadata'] as JsonRecord,
    );
  }
  if (Object.hasOwn(metadata, 'comicMetadata')) {
    decoded['comicMetadata'] = cleanSummaryComicMetadata(metadata['comicMetadata'] as JsonRecord);
  }
  return decoded;
}

function cleanDetailMetadata(metadata: JsonRecord): JsonRecord {
  const decoded = cleanBaseMetadata(metadata);
  Object.assign(decoded, pickFields(metadata, [
    ...DETAIL_METADATA_STRING_FIELDS,
    ...DETAIL_METADATA_NUMBER_FIELDS,
    ...DETAIL_METADATA_BOOLEAN_FIELDS,
    'provider',
  ]));
  if (Object.hasOwn(metadata, 'audiobookMetadata')) {
    const audiobook = metadata['audiobookMetadata'] as JsonRecord;
    const cleanAudiobook = cleanSummaryAudiobookMetadata(audiobook);
    if (Object.hasOwn(audiobook, 'chapters')) {
      cleanAudiobook['chapters'] = (audiobook['chapters'] as JsonRecord[]).map(chapter => pickFields(
        chapter,
        ['index', 'title', 'startTimeMs', 'endTimeMs', 'durationMs'] as const,
      ));
    }
    decoded['audiobookMetadata'] = cleanAudiobook;
  }
  if (Object.hasOwn(metadata, 'comicMetadata')) {
    const comic = metadata['comicMetadata'] as JsonRecord;
    decoded['comicMetadata'] = pickFields(comic, [
      ...COMIC_STRING_ARRAY_FIELDS,
      ...DETAIL_COMIC_STRING_FIELDS,
      ...DETAIL_COMIC_NUMBER_FIELDS,
      ...DETAIL_COMIC_BOOLEAN_FIELDS,
    ]);
  }
  return decoded;
}

function cleanBaseMetadata(metadata: JsonRecord): JsonRecord {
  return pickFields(metadata, [
    'bookId',
    ...BASE_METADATA_STRING_FIELDS,
    ...BASE_METADATA_NUMBER_FIELDS,
    ...BASE_METADATA_STRING_ARRAY_FIELDS,
    'isFixedLayout',
  ]);
}

function cleanSummaryAudiobookMetadata(metadata: JsonRecord): JsonRecord {
  return pickFields(metadata, [...AUDIOBOOK_NUMBER_FIELDS, 'codec']);
}

function cleanSummaryComicMetadata(metadata: JsonRecord): JsonRecord {
  return pickFields(metadata, COMIC_STRING_ARRAY_FIELDS);
}

function pickFields(value: JsonRecord, fields: readonly string[]): JsonRecord {
  const decoded: JsonRecord = {};
  for (const field of fields) {
    if (Object.hasOwn(value, field)) {
      decoded[field] = value[field];
    }
  }
  return decoded;
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(path, 'expected an object');
  }
  return value as JsonRecord;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    invalid(path, 'expected an array');
  }
  return value;
}

function required(value: JsonRecord, field: string, path: string): unknown {
  if (!Object.hasOwn(value, field)) {
    invalid(`${path}.${field}`, 'expected the field to be present');
  }
  return value[field];
}

function requiredField(
  value: JsonRecord,
  field: string,
  path: string,
  validator: Validator,
): void {
  validator(required(value, field, path), `${path}.${field}`);
}

function requiredNumberField(value: JsonRecord, field: string, path: string, integer: boolean): void {
  requiredField(value, field, path, integer ? nonNegativeInteger : numberValue);
}

function requiredNullableField(
  value: JsonRecord,
  field: string,
  path: string,
  validator: Validator,
): void {
  const fieldValue = required(value, field, path);
  if (fieldValue !== null) {
    validator(fieldValue, `${path}.${field}`);
  }
}

function optionalField(value: JsonRecord, field: string, path: string, validator: Validator): void {
  if (Object.hasOwn(value, field)) {
    validator(value[field], `${path}.${field}`);
  }
}

function optionalObject(
  value: JsonRecord,
  field: string,
  path: string,
  validator: (item: JsonRecord, itemPath: string) => void,
): void {
  if (!Object.hasOwn(value, field)) {
    return;
  }
  const itemPath = `${path}.${field}`;
  validator(record(value[field], itemPath), itemPath);
}

function optionalArray(
  value: JsonRecord,
  field: string,
  path: string,
  validator: (item: unknown, itemPath: string) => void,
): void {
  if (!Object.hasOwn(value, field)) {
    return;
  }
  const itemPath = `${path}.${field}`;
  array(value[field], itemPath).forEach((item, index) => validator(item, `${itemPath}[${index}]`));
}

function stringValue(value: unknown, path: string): void {
  if (typeof value !== 'string') {
    invalid(path, 'expected a string');
  }
}

function numberValue(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(path, 'expected a finite number');
  }
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    invalid(path, 'expected a positive integer');
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid(path, 'expected a non-negative integer');
  }
}

function booleanValue(value: unknown, path: string): void {
  if (typeof value !== 'boolean') {
    invalid(path, 'expected a boolean');
  }
}

function stringArray(value: unknown, path: string): void {
  array(value, path).forEach((item, index) => stringValue(item, `${path}[${index}]`));
}

function shelfSortDirection(value: unknown, path: string): void {
  if (value !== 'ASCENDING' && value !== 'DESCENDING') {
    invalid(path, 'expected ASCENDING, DESCENDING, or null');
  }
}

function enumValue<const T extends readonly string[]>(allowed: T): Validator {
  return (value, path) => {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      invalid(path, `expected one of ${allowed.join(', ')}`);
    }
  };
}

function invalid(path: string, reason: string): never {
  throw new Error(`Invalid book query response at ${path}: ${reason}.`);
}
