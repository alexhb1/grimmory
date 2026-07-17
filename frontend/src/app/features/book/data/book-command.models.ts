import {KnownBookReadStatus} from './book-response.models';

export interface SetBookReadStatusVariables {
  readonly bookIds: readonly number[];
  readonly status: KnownBookReadStatus;
}

export interface SetBookReadStatusResult {
  readonly bookId: number;
  readonly readStatus: KnownBookReadStatus;
  readonly readStatusModifiedTime?: string | null;
  readonly dateFinished?: string | null;
}

export interface DeleteBooksVariables {
  readonly bookIds: readonly number[];
}

export interface DeleteBooksResult {
  readonly removedBookIds: readonly number[];
  readonly fileCleanupFailedBookIds: readonly number[];
}

export type BookProgressSource = 'GRIMMORY' | 'KOREADER' | 'KOBO';

export interface ResetBookProgressVariables {
  readonly bookIds: readonly number[];
  readonly source: BookProgressSource;
}

export interface ResetBookProgressResult {
  readonly bookId: number;
  readonly source: BookProgressSource;
  readonly readStatusModifiedTime: string | null;
}

export type BulkBookCommandCompletedResult =
  | DeleteBooksResult
  | readonly ResetBookProgressResult[];

export class BookCommandValidationError extends Error {
  constructor(message: string, options?: {cause?: unknown}) {
    super(message, options);
    this.name = 'BookCommandValidationError';
  }
}

export function validateBookCommandInput<T>(validate: () => T): T {
  try {
    return validate();
  } catch (cause) {
    throw new BookCommandValidationError(
      cause instanceof Error ? cause.message : 'Invalid book command input.',
      {cause},
    );
  }
}

export function reconcileUnlessValidationError(
  error: unknown,
  reconcile: () => Promise<void>,
): Promise<void> | undefined {
  if (error instanceof BookCommandValidationError) {
    return undefined;
  }
  return reconcile();
}

export class BulkBookCommandPartialError extends Error {
  constructor(
    readonly completed: BulkBookCommandCompletedResult,
    readonly attemptedBookIds: readonly number[],
    readonly unsentBookIds: readonly number[],
    override readonly cause: unknown,
  ) {
    super('Bulk book command partially completed.', {cause});
    this.name = 'BulkBookCommandPartialError';
  }
}

export class DeleteBooksPartialError extends BulkBookCommandPartialError {
  declare readonly completed: DeleteBooksResult;

  constructor(
    completed: DeleteBooksResult,
    attemptedBookIds: readonly number[],
    unsentBookIds: readonly number[],
    cause: unknown,
  ) {
    super(completed, attemptedBookIds, unsentBookIds, cause);
    this.name = 'DeleteBooksPartialError';
  }
}

export class ResetBookProgressPartialError extends BulkBookCommandPartialError {
  declare readonly completed: readonly ResetBookProgressResult[];

  constructor(
    completed: readonly ResetBookProgressResult[],
    attemptedBookIds: readonly number[],
    unsentBookIds: readonly number[],
    cause: unknown,
  ) {
    super(completed, attemptedBookIds, unsentBookIds, cause);
    this.name = 'ResetBookProgressPartialError';
  }
}

export const BOOK_METADATA_LOCK_FIELDS = [
  'title', 'subtitle', 'publisher', 'publishedDate', 'description', 'seriesName',
  'seriesNumber', 'seriesTotal', 'isbn13', 'isbn10', 'asin', 'goodreadsId',
  'comicvineId', 'hardcoverId', 'hardcoverBookId', 'googleId',
  'pageCount', 'language', 'amazonRating', 'amazonReviewCount', 'goodreadsRating',
  'goodreadsReviewCount', 'hardcoverRating', 'hardcoverReviewCount',
  'lubimyczytacId', 'lubimyczytacRating', 'ranobedbId',
  'ranobedbRating', 'audibleId', 'audibleRating', 'audibleReviewCount',
  'cover', 'audiobookCover', 'thumbnail', 'authors', 'categories',
  'moods', 'tags', 'reviews', 'narrator', 'abridged', 'ageRating', 'contentRating',
] as const;

export type BookMetadataLockField = typeof BOOK_METADATA_LOCK_FIELDS[number];

export interface SetBookMetadataFieldLocksVariables {
  readonly bookIds: readonly number[];
  readonly fieldLocks: Partial<Record<BookMetadataLockField, boolean>>;
}

export interface SetAllBookMetadataLocksVariables {
  readonly bookIds: readonly number[];
  readonly locked: boolean;
}

export interface SetAllBookMetadataLocksResult {
  readonly bookId: number;
  readonly locked: boolean;
  readonly metadataLocks: Readonly<Record<string, boolean>>;
}
