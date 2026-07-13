import {HttpClient, HttpParams} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {bookCommandKeys, bookCommandScopes} from './book-command-keys';
import {applyBookQueryChangeSet} from './book-query-cache';
import {
  BulkBookCommandCompletedResult,
  BulkBookCommandPartialError,
  DeleteBooksResult,
  SetBookMetadataFieldLocksResult,
  BookMetadataLockField,
  SetAllBookMetadataLocksResult,
  BookProgressSource,
  SetBookReadStatusResult,
  ResetBookProgressResult,
  DeleteBooksVariables,
  ResetBookProgressVariables,
  SetAllBookMetadataLocksVariables,
  SetBookReadStatusVariables,
  SetBookMetadataFieldLocksVariables,
} from './book-command.models';
import {BookReadStatus} from './book-response.models';
import {
  decodeAllMetadataLockResults,
  normalizeMetadataFieldLocks,
  toMetadataLockWireActions,
} from './book-metadata-lock-codec';

const DELETE_BOOKS_CHUNK_SIZE = 200;
const RESET_PROGRESS_CHUNK_SIZE = 500;

const BOOK_READ_STATUSES = new Set<BookReadStatus>([
  'UNREAD',
  'READING',
  'RE_READING',
  'READ',
  'PARTIALLY_READ',
  'PAUSED',
  'WONT_READ',
  'ABANDONED',
  'UNSET',
]);

const RESET_PROGRESS_BACKEND_TYPES = {
  GRIMMORY: 'BOOKLORE',
  KOREADER: 'KOREADER',
  KOBO: 'KOBO',
} as const satisfies Record<BookProgressSource, string>;

@Injectable({providedIn: 'root'})
export class BookCommandService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_CONFIG.BASE_URL}/api/v1/books`;

  setReadStatus() {
    return mutationOptions({
      mutationKey: bookCommandKeys.readStatus(),
      scope: bookCommandScopes.readingState,
      mutationFn: ({bookIds, status}: SetBookReadStatusVariables) => {
        const normalizedBookIds = normalizeBookIds(bookIds);
        return this.postReadStatus(normalizedBookIds, normalizeReadStatus(status));
      },
      onSuccess: (results, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: results.map(result => result.bookId),
      }),
      retry: false,
    });
  }

  deleteBooks() {
    return mutationOptions({
      mutationKey: bookCommandKeys.deleteBooks(),
      scope: bookCommandScopes.deletion,
      mutationFn: ({bookIds}: DeleteBooksVariables) => this.deleteBookRecordsInChunks(
        normalizeBookIds(bookIds),
      ),
      onSuccess: (result, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        deletedBookIds: result.removedBookIds,
      }),
      onError: (error, _variables, _onMutateResult, {client}) => {
        if (error instanceof BulkBookCommandPartialError
          && isDeleteBooksResult(error.completed)) {
          return applyBookQueryChangeSet(client, {
            deletedBookIds: error.completed.removedBookIds,
          });
        }
        return undefined;
      },
      retry: false,
    });
  }

  resetProgress() {
    return mutationOptions({
      mutationKey: bookCommandKeys.resetProgress(),
      scope: bookCommandScopes.readingState,
      mutationFn: ({bookIds, source}: ResetBookProgressVariables) => this.postResetProgressInChunks(
        normalizeBookIds(bookIds),
        normalizeProgressSource(source),
      ),
      onSuccess: (results, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: results.map(result => result.bookId),
      }),
      onError: (error, _variables, _onMutateResult, {client}) => {
        if (error instanceof BulkBookCommandPartialError
          && isResetProgressResults(error.completed)) {
          return applyBookQueryChangeSet(client, {
            changedBookIds: error.completed.map(result => result.bookId),
          });
        }
        return undefined;
      },
      retry: false,
    });
  }

  setMetadataFieldLocks() {
    return mutationOptions({
      mutationKey: bookCommandKeys.metadataFieldLocks(),
      scope: bookCommandScopes.metadata,
      mutationFn: ({bookIds, fieldLocks}: SetBookMetadataFieldLocksVariables) => this.putMetadataFieldLocks(
        normalizeBookIds(bookIds),
        normalizeMetadataFieldLocks(fieldLocks),
      ),
      onSuccess: (result, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: result.bookIds,
      }),
      retry: false,
    });
  }

  setAllMetadataLocks() {
    return mutationOptions({
      mutationKey: bookCommandKeys.metadataAllLocks(),
      scope: bookCommandScopes.metadata,
      mutationFn: ({bookIds, locked}: SetAllBookMetadataLocksVariables) => this.putAllMetadataLocks(
        normalizeBookIds(bookIds),
        normalizeBoolean(locked, 'Metadata locked state'),
      ),
      onSuccess: (results, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: results.map(result => result.bookId),
      }),
      retry: false,
    });
  }

  private async postReadStatus(
    bookIds: readonly number[],
    status: BookReadStatus,
  ): Promise<readonly SetBookReadStatusResult[]> {
    const response = await lastValueFrom(this.http.post<unknown>(
      `${this.baseUrl}/status`,
      {bookIds, status},
    ));

    return decodeReadStatusResults(response, bookIds, status);
  }

  private async deleteBookRecords(
    bookIds: readonly number[],
  ): Promise<DeleteBooksResult> {
    const response = await lastValueFrom(this.http.delete<unknown>(
      this.baseUrl,
      {params: new HttpParams().set('ids', bookIds.join(','))},
    ));
    return decodeBookDeletionResult(response, bookIds);
  }

  private async deleteBookRecordsInChunks(
    bookIds: readonly number[],
  ): Promise<DeleteBooksResult> {
    let completed: DeleteBooksResult = {
      removedBookIds: [],
      fileCleanupFailedBookIds: [],
    };

    for (let offset = 0; offset < bookIds.length; offset += DELETE_BOOKS_CHUNK_SIZE) {
      const chunk = bookIds.slice(offset, offset + DELETE_BOOKS_CHUNK_SIZE);
      try {
        const result = await this.deleteBookRecords(chunk);
        completed = {
          removedBookIds: [...completed.removedBookIds, ...result.removedBookIds],
          fileCleanupFailedBookIds: [
            ...completed.fileCleanupFailedBookIds,
            ...result.fileCleanupFailedBookIds,
          ],
        };
      } catch (cause) {
        if (offset === 0) {
          throw cause;
        }
        throw new BulkBookCommandPartialError(completed, bookIds.slice(offset), cause);
      }
    }

    return completed;
  }

  private async postResetProgress(
    bookIds: readonly number[],
    source: BookProgressSource,
  ): Promise<readonly ResetBookProgressResult[]> {
    const response = await lastValueFrom(this.http.post<unknown>(
      `${this.baseUrl}/reset-progress`,
      bookIds,
      {params: {type: RESET_PROGRESS_BACKEND_TYPES[source]}},
    ));

    return decodeResetProgressResults(response, bookIds, source);
  }

  private async postResetProgressInChunks(
    bookIds: readonly number[],
    source: BookProgressSource,
  ): Promise<readonly ResetBookProgressResult[]> {
    let completed: readonly ResetBookProgressResult[] = [];

    for (let offset = 0; offset < bookIds.length; offset += RESET_PROGRESS_CHUNK_SIZE) {
      const chunk = bookIds.slice(offset, offset + RESET_PROGRESS_CHUNK_SIZE);
      try {
        const results = await this.postResetProgress(chunk, source);
        completed = [...completed, ...results];
      } catch (cause) {
        if (offset === 0) {
          throw cause;
        }
        throw new BulkBookCommandPartialError(completed, bookIds.slice(offset), cause);
      }
    }

    return completed;
  }

  private async putMetadataFieldLocks(
    bookIds: readonly number[],
    fieldLocks: Readonly<Partial<Record<BookMetadataLockField, boolean>>>,
  ): Promise<SetBookMetadataFieldLocksResult> {
    await lastValueFrom(this.http.put<unknown>(`${this.baseUrl}/metadata/toggle-field-locks`, {
      bookIds,
      fieldActions: toMetadataLockWireActions(fieldLocks),
    }));
    return {bookIds, fieldLocks};
  }

  private async putAllMetadataLocks(
    bookIds: readonly number[],
    locked: boolean,
  ): Promise<readonly SetAllBookMetadataLocksResult[]> {
    const response = await lastValueFrom(this.http.put<unknown>(
      `${this.baseUrl}/metadata/toggle-all-lock`,
      {bookIds, lock: locked ? 'LOCK' : 'UNLOCK'},
    ));
    return decodeAllMetadataLockResults(response, bookIds, locked);
  }
}

function normalizeBookIds(bookIds: readonly number[]): readonly number[] {
  if (!Array.isArray(bookIds)) {
    throw new Error('Book IDs must be an array.');
  }
  const normalized = [...new Set(bookIds.map(bookId => {
    return normalizeBookId(bookId);
  }))];

  if (normalized.length === 0) {
    throw new Error('At least one book ID is required.');
  }

  return normalized;
}

function isDeleteBooksResult(
  result: BulkBookCommandCompletedResult,
): result is DeleteBooksResult {
  return 'removedBookIds' in result;
}

function isResetProgressResults(
  result: BulkBookCommandCompletedResult,
): result is readonly ResetBookProgressResult[] {
  return Array.isArray(result);
}

function normalizeBookId(bookId: number): number {
  if (!Number.isSafeInteger(bookId) || bookId <= 0) {
    throw new Error('Book ID must be a positive integer.');
  }
  return bookId;
}

function normalizeReadStatus(status: BookReadStatus): BookReadStatus {
  if (!BOOK_READ_STATUSES.has(status)) {
    throw new Error(`Unsupported book read status: ${status}`);
  }
  return status;
}

function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function normalizeProgressSource(source: BookProgressSource): BookProgressSource {
  if (!Object.hasOwn(RESET_PROGRESS_BACKEND_TYPES, source)) {
    throw new Error(`Unsupported reset-progress source: ${source}`);
  }
  return source;
}

function decodeReadStatusResults(
  response: unknown,
  requestedBookIds: readonly number[],
  requestedStatus: BookReadStatus,
): readonly SetBookReadStatusResult[] {
  if (!Array.isArray(response)) {
    throw new Error('Invalid book read-status response.');
  }

  const results = response.map(decodeReadStatusResult);
  if (!resultsMatchRequestedBookIds(results, requestedBookIds)
    || results.some(result => result.readStatus !== requestedStatus)) {
    throw new Error('Invalid book read-status response.');
  }

  return results;
}

function decodeBookDeletionResult(
  response: unknown,
  requestedBookIds: readonly number[],
): DeleteBooksResult {
  if (!isRecord(response) || !Array.isArray(response['failedFileDeletions'])) {
    throw new Error('Invalid book-deletion response.');
  }
  const requested = new Set(requestedBookIds);
  const seen = new Set<number>();
  const fileCleanupFailedBookIds = response['failedFileDeletions'].map(bookId => {
    if (!isPositiveSafeInteger(bookId) || !requested.has(bookId) || seen.has(bookId)) {
      throw new Error('Invalid book-deletion response.');
    }
    seen.add(bookId);
    return bookId;
  });
  return {
    removedBookIds: requestedBookIds,
    fileCleanupFailedBookIds,
  };
}

function decodeReadStatusResult(response: unknown): SetBookReadStatusResult {
  if (!isRecord(response)
    || !isPositiveSafeInteger(response['bookId'])
    || typeof response['readStatus'] !== 'string'
    || !BOOK_READ_STATUSES.has(response['readStatus'] as BookReadStatus)) {
    throw new Error('Invalid book read-status response.');
  }

  const readStatusModifiedTime = decodeOptionalNullableString(
    response,
    'readStatusModifiedTime',
    'Invalid book read-status response.',
  );
  const dateFinished = decodeOptionalNullableString(
    response,
    'dateFinished',
    'Invalid book read-status response.',
  );

  return {
    bookId: response['bookId'],
    readStatus: response['readStatus'] as BookReadStatus,
    ...(readStatusModifiedTime !== undefined ? {readStatusModifiedTime} : {}),
    ...(dateFinished !== undefined ? {dateFinished} : {}),
  };
}

function decodeResetProgressResults(
  response: unknown,
  requestedBookIds: readonly number[],
  source: BookProgressSource,
): readonly ResetBookProgressResult[] {
  if (!Array.isArray(response)) {
    throw new Error('Invalid book reset-progress response.');
  }

  const requested = new Set(requestedBookIds);
  const seen = new Set<number>();
  return response.map(result => {
    if (!isRecord(result) || !isPositiveSafeInteger(result['bookId'])) {
      throw new Error('Invalid book reset-progress response.');
    }

    const bookId = result['bookId'];
    if (!requested.has(bookId) || seen.has(bookId)) {
      throw new Error('Invalid book reset-progress response.');
    }
    seen.add(bookId);

    return {bookId, source};
  });
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

function decodeOptionalNullableString(
  response: Record<string, unknown>,
  field: string,
  errorMessage: string,
): string | null | undefined {
  if (!Object.hasOwn(response, field)) {
    return undefined;
  }

  const value = response[field];
  if (value !== null && typeof value !== 'string') {
    throw new Error(errorMessage);
  }

  return value;
}
