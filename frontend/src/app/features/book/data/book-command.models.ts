import {BookReadStatus} from './book-response.models';

export interface SetBookReadStatusVariables {
  readonly bookIds: readonly number[];
  readonly status: BookReadStatus;
}

export interface SetBookReadStatusResult {
  readonly bookId: number;
  readonly readStatus: BookReadStatus;
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
}

export type BulkBookCommandCompletedResult =
  | DeleteBooksResult
  | readonly ResetBookProgressResult[];

export class BulkBookCommandPartialError extends Error {
  constructor(
    readonly completed: BulkBookCommandCompletedResult,
    readonly failedBookIds: readonly number[],
    override readonly cause: unknown,
  ) {
    super('Bulk book command partially completed.', {cause});
    this.name = 'BulkBookCommandPartialError';
  }
}

export type BookMetadataLockField =
  | 'title'
  | 'subtitle'
  | 'publisher'
  | 'publishedDate'
  | 'description'
  | 'seriesName'
  | 'seriesNumber'
  | 'seriesTotal'
  | 'isbn13'
  | 'isbn10'
  | 'asin'
  | 'goodreadsId'
  | 'comicvineId'
  | 'hardcoverId'
  | 'hardcoverBookId'
  | 'doubanId'
  | 'googleId'
  | 'pageCount'
  | 'language'
  | 'amazonRating'
  | 'amazonReviewCount'
  | 'goodreadsRating'
  | 'goodreadsReviewCount'
  | 'hardcoverRating'
  | 'hardcoverReviewCount'
  | 'doubanRating'
  | 'doubanReviewCount'
  | 'lubimyczytacId'
  | 'lubimyczytacRating'
  | 'ranobedbId'
  | 'ranobedbRating'
  | 'audibleId'
  | 'audibleRating'
  | 'audibleReviewCount'
  | 'externalUrl'
  | 'cover'
  | 'audiobookCover'
  | 'thumbnail'
  | 'authors'
  | 'categories'
  | 'moods'
  | 'tags'
  | 'reviews'
  | 'narrator'
  | 'abridged'
  | 'ageRating'
  | 'contentRating';

export interface SetBookMetadataFieldLocksVariables {
  readonly bookIds: readonly number[];
  readonly fieldLocks: Partial<Record<BookMetadataLockField, boolean>>;
}

export interface SetBookMetadataFieldLocksResult {
  readonly bookIds: readonly number[];
  readonly fieldLocks: Readonly<Partial<Record<BookMetadataLockField, boolean>>>;
}

export interface SetAllBookMetadataLocksVariables {
  readonly bookIds: readonly number[];
  readonly locked: boolean;
}

export interface SetAllBookMetadataLocksResult {
  readonly bookId: number;
  readonly locked: boolean;
}
