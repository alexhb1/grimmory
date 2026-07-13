import {
  BookMetadataLockField,
  SetAllBookMetadataLocksResult,
} from './book-command.models';

const METADATA_LOCK_FIELDS = new Set<BookMetadataLockField>([
  'title', 'subtitle', 'publisher', 'publishedDate', 'description', 'seriesName',
  'seriesNumber', 'seriesTotal', 'isbn13', 'isbn10', 'asin', 'goodreadsId',
  'comicvineId', 'hardcoverId', 'hardcoverBookId', 'doubanId', 'googleId',
  'pageCount', 'language', 'amazonRating', 'amazonReviewCount', 'goodreadsRating',
  'goodreadsReviewCount', 'hardcoverRating', 'hardcoverReviewCount', 'doubanRating',
  'doubanReviewCount', 'lubimyczytacId', 'lubimyczytacRating', 'ranobedbId',
  'ranobedbRating', 'audibleId', 'audibleRating', 'audibleReviewCount',
  'externalUrl', 'cover', 'audiobookCover', 'thumbnail', 'authors', 'categories',
  'moods', 'tags', 'reviews', 'narrator', 'abridged', 'ageRating', 'contentRating',
]);

export function normalizeMetadataFieldLocks(
  fieldLocks: Partial<Record<BookMetadataLockField, boolean>>,
): Readonly<Partial<Record<BookMetadataLockField, boolean>>> {
  if (!isRecord(fieldLocks)) {
    throw new Error('Metadata field locks must be an object.');
  }

  const normalized: Partial<Record<BookMetadataLockField, boolean>> = {};
  for (const [field, locked] of Object.entries(fieldLocks)) {
    if (!METADATA_LOCK_FIELDS.has(field as BookMetadataLockField)) {
      throw new Error(`Unsupported metadata lock field: ${field}`);
    }
    if (typeof locked !== 'boolean') {
      throw new Error(`Metadata lock ${field} must be a boolean.`);
    }
    normalized[field as BookMetadataLockField] = locked;
  }
  if (Object.keys(normalized).length === 0) {
    throw new Error('At least one metadata field lock is required.');
  }
  return normalized;
}

export function toMetadataLockWireActions(
  fieldLocks: Readonly<Partial<Record<BookMetadataLockField, boolean>>>,
): Readonly<Record<string, 'LOCK' | 'UNLOCK'>> {
  const actions: Record<string, 'LOCK' | 'UNLOCK'> = {};
  for (const [field, locked] of Object.entries(fieldLocks)) {
    const wireField = field === 'thumbnail' ? 'thumbnailLocked' : `${field}Locked`;
    actions[wireField] = locked ? 'LOCK' : 'UNLOCK';
  }
  return actions;
}

export function decodeAllMetadataLockResults(
  response: unknown,
  requestedBookIds: readonly number[],
  locked: boolean,
): readonly SetAllBookMetadataLocksResult[] {
  if (!Array.isArray(response)) {
    throw new Error('Invalid metadata all-lock response.');
  }

  const results = response.map(item => {
    if (!isRecord(item) || !isPositiveSafeInteger(item['bookId'])) {
      throw new Error('Invalid metadata all-lock response.');
    }
    return {bookId: item['bookId'], locked};
  });
  if (!resultsMatchRequestedBookIds(results, requestedBookIds)) {
    throw new Error('Invalid metadata all-lock response.');
  }
  return results;
}

function resultsMatchRequestedBookIds(
  results: readonly {readonly bookId: number}[],
  requestedBookIds: readonly number[],
): boolean {
  if (results.length !== requestedBookIds.length) {
    return false;
  }
  const resultBookIds = new Set(results.map(result => result.bookId));
  return resultBookIds.size === requestedBookIds.length
    && requestedBookIds.every(bookId => resultBookIds.has(bookId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
