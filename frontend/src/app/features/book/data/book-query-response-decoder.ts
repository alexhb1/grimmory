import {
  BookFacetGroup,
  BookPage,
} from './book-query.models';
import {
  BookDetail,
  BookDetailComicMetadata,
  BookDetailMetadata,
  BookRecommendation,
  BookSummary,
  BookSummaryAudiobookMetadata,
  BookSummaryComicMetadata,
  BookSummaryMetadata,
} from './book-response.models';

type JsonRecord = Record<string, unknown>;
type Validator<T = unknown> = (value: unknown, path: string) => T;

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
] as const satisfies readonly (keyof BookSummaryMetadata)[];
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
] as const satisfies readonly (keyof BookSummaryMetadata)[];
const BASE_METADATA_STRING_ARRAY_FIELDS = ['authors', 'categories', 'moods', 'tags'] as const satisfies readonly (keyof BookSummaryMetadata)[];
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
] as const satisfies readonly (keyof BookDetailMetadata)[];
const DETAIL_METADATA_NUMBER_FIELDS = [
  'seriesTotal',
  'doubanRating',
  'doubanReviewCount',
  'lubimyczytacRating',
  'audibleRating',
  'audibleReviewCount',
] as const satisfies readonly (keyof BookDetailMetadata)[];
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
] as const satisfies readonly (keyof BookDetailMetadata)[];
const AUDIOBOOK_NUMBER_FIELDS = [
  'durationSeconds',
  'bitrate',
  'sampleRate',
  'channels',
  'chapterCount',
] as const satisfies readonly (keyof BookSummaryAudiobookMetadata)[];
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
] as const satisfies readonly (keyof BookSummaryComicMetadata)[];
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
] as const satisfies readonly (keyof BookDetailComicMetadata)[];
const DETAIL_COMIC_NUMBER_FIELDS = ['volumeNumber', 'storyArcNumber'] as const satisfies readonly (keyof BookDetailComicMetadata)[];
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
] as const satisfies readonly (keyof BookDetailComicMetadata)[];

export function decodeBookPage(value: unknown): BookPage {
  const response = record(value, 'page');
  const content = array(required(response, 'content', 'page'), 'page.content');
  const decodedContent: BookSummary[] = [];
  content.forEach((book, index) => {
    try {
      decodedContent.push(decodeBookSummary(book, `page.content[${index}]`));
    } catch (error) {
      console.warn('[BookQuery] Dropped malformed book from page response', error);
    }
  });
  if (content.length > 0 && decodedContent.length === 0) {
    invalid('page.content', 'every book failed validation');
  }

  const metadata = record(required(response, 'page', 'page'), 'page.page');
  const number = requiredNumberField(metadata, 'number', 'page.page', true);
  const size = requiredNumberField(metadata, 'size', 'page.page', true);
  const totalElements = requiredNumberField(metadata, 'totalElements', 'page.page', true);
  const totalPages = requiredNumberField(metadata, 'totalPages', 'page.page', true);
  const cursor = optionalField(metadata, 'cursor', 'page.page', stringValue);

  const decodedLinks = decodeLinks(required(response, 'links', 'page'), 'page.links');

  return {
    content: decodedContent,
    page: {
      number,
      size,
      totalElements,
      totalPages,
      ...(cursor === undefined ? {} : {cursor}),
    },
    links: decodedLinks,
  };
}

export function decodeBookFacetGroups(value: unknown): BookFacetGroup[] {
  const response = record(value, 'facets');
  decodeLinks(required(response, 'links', 'facets'), 'facets.links');
  const facets = array(required(response, 'facets', 'facets'), 'facets.facets');
  return facets.map((facet, facetIndex) => {
    const path = `facets.facets[${facetIndex}]`;
    const group = record(facet, path);
    const metadata = record(required(group, 'metadata', path), `${path}.metadata`);
    const rel = requiredField(metadata, 'rel', `${path}.metadata`, stringValue);
    const key = requiredField(metadata, 'key', `${path}.metadata`, stringValue);
    const title = requiredField(metadata, 'title', `${path}.metadata`, stringValue);
    const links = array(required(group, 'links', path), `${path}.links`);
    const values = links.map((link, linkIndex) => {
      const linkPath = `${path}.links[${linkIndex}]`;
      const item = record(link, linkPath);
      const rel = relValue(required(item, 'rel', linkPath), `${linkPath}.rel`);
      requiredField(item, 'href', linkPath, stringValue);
      requiredField(item, 'type', linkPath, stringValue);
      const itemTitle = requiredField(item, 'title', linkPath, stringValue);
      const itemValue = requiredField(item, 'value', linkPath, stringValue);
      let count: number | undefined;
      optionalObject(item, 'properties', linkPath, (properties, propertiesPath) => {
        count = optionalField(properties, 'numberOfItems', propertiesPath, nonNegativeInteger);
      });
      return {
        value: itemValue,
        title: itemTitle,
        selected: rel.includes('self'),
        ...(count == null ? {} : {count}),
      };
    });
    return {
      rel,
      key,
      title,
      values,
    };
  });
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
    const similarityScore = requiredField(item, 'similarityScore', path, numberValue);
    seen.add(id);
    return {
      book: decodedBook,
      similarityScore,
    };
  });
}

function decodeBookSummary(value: unknown, path: string): BookSummary {
  assertBookSummary(value, path);
  return value;
}

function assertBookSummary(value: unknown, path: string): asserts value is BookSummary {
  const book = validateBookFields(value, path);
  optionalObject(book, 'metadata', path, (metadata, metadataPath) => {
    validateBaseMetadata(metadata, metadataPath, positiveInteger(book['id'], `${path}.id`));
    requiredField(metadata, 'allMetadataLocked', metadataPath, booleanValue);
    optionalObject(metadata, 'audiobookMetadata', metadataPath, validateSummaryAudiobookMetadata);
    optionalObject(metadata, 'comicMetadata', metadataPath, validateSummaryComicMetadata);
  });
}

function decodeBookDetailAt(value: unknown, path: string, expectedBookId: number): BookDetail {
  assertBookDetail(value, path, expectedBookId);
  return value;
}

function assertBookDetail(
  value: unknown,
  path: string,
  expectedBookId: number,
): asserts value is BookDetail {
  const book = validateBookFields(value, path);
  const id = positiveInteger(book['id'], `${path}.id`);
  if (id !== expectedBookId) {
    invalid(`${path}.id`, `expected book ID ${expectedBookId}`);
  }
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
    optionalField(metadata, 'provider', metadataPath, stringValue);
    optionalObject(metadata, 'audiobookMetadata', metadataPath, validateDetailAudiobookMetadata);
    optionalObject(metadata, 'comicMetadata', metadataPath, validateDetailComicMetadata);
  });
  optionalObject(book, 'libraryPath', path, (libraryPath, libraryPathName) => {
    requiredField(libraryPath, 'id', libraryPathName, positiveInteger);
  });
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
  optionalField(book, 'readStatus', path, stringValue);
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
  optionalField(file, 'bookType', path, stringValue);
  optionalField(file, 'archiveType', path, stringValue);
  optionalField(file, 'fileSizeKb', path, numberValue);
}

function validateShelf(shelf: unknown, path: string): void {
  const item = record(shelf, path);
  optionalField(item, 'id', path, positiveInteger);
  requiredField(item, 'name', path, stringValue);
  optionalField(item, 'icon', path, stringValue);
  optionalField(item, 'iconType', path, stringValue);
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

function requiredField<T>(
  value: JsonRecord,
  field: string,
  path: string,
  validator: Validator<T>,
): T {
  return validator(required(value, field, path), `${path}.${field}`);
}

function requiredNumberField(
  value: JsonRecord,
  field: string,
  path: string,
  integer: boolean,
): number {
  return requiredField(value, field, path, integer ? nonNegativeInteger : numberValue);
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

function optionalField<T>(
  value: JsonRecord,
  field: string,
  path: string,
  validator: Validator<T>,
): T | undefined {
  if (Object.hasOwn(value, field)) {
    return validator(value[field], `${path}.${field}`);
  }
  return undefined;
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

function decodeLinks(value: unknown, path: string): {rel: string[]; href: string; type: string}[] {
  return array(value, path).map((link, index) => {
    const linkPath = `${path}[${index}]`;
    const item = record(link, linkPath);
    const rel = relValue(required(item, 'rel', linkPath), `${linkPath}.rel`);
    const href = requiredField(item, 'href', linkPath, stringValue);
    const type = requiredField(item, 'type', linkPath, stringValue);
    return {rel, href, type};
  });
}

function relValue(value: unknown, path: string): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  const rels = array(value, path);
  if (rels.length === 0) {
    invalid(path, 'expected at least one relation');
  }
  return rels.map((item, index) => stringValue(item, `${path}[${index}]`));
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    invalid(path, 'expected a string');
  }
  return value;
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(path, 'expected a finite number');
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    invalid(path, 'expected a positive integer');
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid(path, 'expected a non-negative integer');
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    invalid(path, 'expected a boolean');
  }
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => stringValue(item, `${path}[${index}]`));
}

function shelfSortDirection(value: unknown, path: string): 'ASCENDING' | 'DESCENDING' {
  if (value !== 'ASCENDING' && value !== 'DESCENDING') {
    invalid(path, 'expected ASCENDING, DESCENDING, or null');
  }
  return value;
}

function invalid(path: string, reason: string): never {
  throw new Error(`Invalid book query response at ${path}: ${reason}.`);
}
