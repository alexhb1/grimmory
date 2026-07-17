import {
  BOOK_METADATA_LOCK_FIELDS,
  BookMetadataLockField,
  SetAllBookMetadataLocksResult,
} from './book-command.models';
import {isPositiveSafeInteger, isRecord} from './json-guards';

const METADATA_LOCK_FIELD_SET = new Set<string>(BOOK_METADATA_LOCK_FIELDS);

export function normalizeMetadataFieldLocks(
  fieldLocks: Partial<Record<BookMetadataLockField, boolean>>,
): Readonly<Partial<Record<BookMetadataLockField, boolean>>> {
  if (!isRecord(fieldLocks)) {
    throw new Error('Metadata field locks must be an object.');
  }

  const normalized: Partial<Record<BookMetadataLockField, boolean>> = {};
  for (const [field, locked] of Object.entries(fieldLocks)) {
    if (!METADATA_LOCK_FIELD_SET.has(field)) {
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
  if (normalized.cover !== undefined
    && normalized.thumbnail !== undefined
    && normalized.cover !== normalized.thumbnail) {
    throw new Error('Cover and thumbnail locks cannot have conflicting states.');
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

  const requested = new Set(requestedBookIds);
  const seen = new Set<number>();
  return response.map(item => {
    if (!isRecord(item) || !isPositiveSafeInteger(item['bookId'])) {
      throw new Error('Invalid metadata all-lock response.');
    }
    const bookId = item['bookId'];
    if (!requested.has(bookId) || seen.has(bookId)) {
      throw new Error('Invalid metadata all-lock response.');
    }
    const metadataLocks: Record<string, boolean> = {};
    for (const [field, value] of Object.entries(item)) {
      if (field === 'allMetadataLocked' || field.endsWith('Locked')) {
        if (typeof value !== 'boolean') {
          throw new Error('Invalid metadata all-lock response.');
        }
        metadataLocks[field] = value;
      }
    }
    if (metadataLocks['allMetadataLocked'] !== locked) {
      throw new Error('Invalid metadata all-lock response.');
    }
    seen.add(bookId);
    return {bookId, locked, metadataLocks};
  });
}
