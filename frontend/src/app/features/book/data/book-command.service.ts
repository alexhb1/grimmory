import {HttpClient, HttpParams} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {normalizeBookIds} from './book-id';
import {bookCommandKeys, bookCommandScopes} from './book-command-keys';
import {applyBookQueryChangeSet} from './book-query-cache';
import {
  DeleteBooksPartialError,
  DeleteBooksResult,
  BookMetadataLockField,
  SetAllBookMetadataLocksResult,
  BookProgressSource,
  SetBookReadStatusResult,
  ResetBookProgressPartialError,
  ResetBookProgressResult,
  DeleteBooksVariables,
  ResetBookProgressVariables,
  SetAllBookMetadataLocksVariables,
  SetBookReadStatusVariables,
  SetBookMetadataFieldLocksVariables,
  reconcileUnlessValidationError,
  validateBookCommandInput,
} from './book-command.models';
import {BOOK_READ_STATUSES, KnownBookReadStatus} from './book-response.models';
import {
  decodeAllMetadataLockResults,
  normalizeMetadataFieldLocks,
  toMetadataLockWireActions,
} from './book-metadata-lock-codec';
import {isPositiveSafeInteger, isRecord} from './json-guards';

const DELETE_BOOKS_CHUNK_SIZE = 200;
const RESET_PROGRESS_CHUNK_SIZE = 500;

const BOOK_READ_STATUS_SET = new Set<KnownBookReadStatus>(BOOK_READ_STATUSES);

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
      mutationFn: (variables: SetBookReadStatusVariables) => {
        const input = validateBookCommandInput(() => ({
          bookIds: normalizeBookIds(variables.bookIds),
          status: normalizeReadStatus(variables.status),
        }));
        return this.postReadStatus(input.bookIds, input.status);
      },
      onSuccess: (results, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: results.map(result => result.bookId),
      }),
      onError: (error, variables, _onMutateResult, {client}) => reconcileUnlessValidationError(
        error,
        () => applyBookQueryChangeSet(client, {changedBookIds: variables.bookIds}),
      ),
      retry: false,
    });
  }

  deleteBooks() {
    return mutationOptions({
      mutationKey: bookCommandKeys.deleteBooks(),
      scope: bookCommandScopes.deletion,
      mutationFn: (variables: DeleteBooksVariables) => {
        const input = validateBookCommandInput(() => ({
          bookIds: normalizeBookIds(variables.bookIds),
        }));
        return this.deleteBookRecordsInChunks(input.bookIds);
      },
      onSuccess: (result, variables, _onMutateResult, {client}) => {
        const removed = new Set(result.removedBookIds);
        return applyBookQueryChangeSet(client, {
          deletedBookIds: result.removedBookIds,
          changedBookIds: variables.bookIds.filter(bookId => !removed.has(bookId)),
        });
      },
      onError: (error, variables, _onMutateResult, {client}) => reconcileUnlessValidationError(error, () => {
        if (error instanceof DeleteBooksPartialError) {
          return applyBookQueryChangeSet(client, {
            deletedBookIds: error.completed.removedBookIds,
            changedBookIds: error.attemptedBookIds,
          });
        }
        return applyBookQueryChangeSet(client, {changedBookIds: variables.bookIds});
      }),
      retry: false,
    });
  }

  resetProgress() {
    return mutationOptions({
      mutationKey: bookCommandKeys.resetProgress(),
      scope: bookCommandScopes.readingState,
      mutationFn: (variables: ResetBookProgressVariables) => {
        const input = validateBookCommandInput(() => ({
          bookIds: normalizeBookIds(variables.bookIds),
          source: normalizeProgressSource(variables.source),
        }));
        return this.postResetProgressInChunks(input.bookIds, input.source);
      },
      onSuccess: (results, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: results.map(result => result.bookId),
      }),
      onError: (error, variables, _onMutateResult, {client}) => reconcileUnlessValidationError(error, () => {
        if (error instanceof ResetBookProgressPartialError) {
          return applyBookQueryChangeSet(client, {
            changedBookIds: [
              ...error.completed.map(result => result.bookId),
              ...error.attemptedBookIds,
            ],
          });
        }
        return applyBookQueryChangeSet(client, {changedBookIds: variables.bookIds});
      }),
      retry: false,
    });
  }

  setMetadataFieldLocks() {
    return mutationOptions({
      mutationKey: bookCommandKeys.metadataFieldLocks(),
      scope: bookCommandScopes.metadata,
      mutationFn: (variables: SetBookMetadataFieldLocksVariables) => {
        const input = validateBookCommandInput(() => ({
          bookIds: normalizeBookIds(variables.bookIds),
          fieldLocks: normalizeMetadataFieldLocks(variables.fieldLocks),
        }));
        return this.putMetadataFieldLocks(input.bookIds, input.fieldLocks);
      },
      onSuccess: (_result, {bookIds}, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: normalizeBookIds(bookIds),
      }),
      onError: (error, variables, _onMutateResult, {client}) => reconcileUnlessValidationError(
        error,
        () => applyBookQueryChangeSet(client, {changedBookIds: variables.bookIds}),
      ),
      retry: false,
    });
  }

  setAllMetadataLocks() {
    return mutationOptions({
      mutationKey: bookCommandKeys.metadataAllLocks(),
      scope: bookCommandScopes.metadata,
      mutationFn: (variables: SetAllBookMetadataLocksVariables) => {
        const input = validateBookCommandInput(() => ({
          bookIds: normalizeBookIds(variables.bookIds),
          locked: normalizeBoolean(variables.locked, 'Metadata locked state'),
        }));
        return this.putAllMetadataLocks(input.bookIds, input.locked);
      },
      onSuccess: (results, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: results.map(result => result.bookId),
      }),
      onError: (error, variables, _onMutateResult, {client}) => reconcileUnlessValidationError(
        error,
        () => applyBookQueryChangeSet(client, {changedBookIds: variables.bookIds}),
      ),
      retry: false,
    });
  }

  private async postReadStatus(
    bookIds: readonly number[],
    status: KnownBookReadStatus,
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
        throw new DeleteBooksPartialError(
          completed,
          chunk,
          bookIds.slice(offset + DELETE_BOOKS_CHUNK_SIZE),
          cause,
        );
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
        throw new ResetBookProgressPartialError(
          completed,
          chunk,
          bookIds.slice(offset + RESET_PROGRESS_CHUNK_SIZE),
          cause,
        );
      }
    }

    return completed;
  }

  private async putMetadataFieldLocks(
    bookIds: readonly number[],
    fieldLocks: Readonly<Partial<Record<BookMetadataLockField, boolean>>>,
  ): Promise<void> {
    await lastValueFrom(this.http.put<unknown>(`${this.baseUrl}/metadata/toggle-field-locks`, {
      bookIds,
      fieldActions: toMetadataLockWireActions(fieldLocks),
    }));
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

function normalizeReadStatus(status: KnownBookReadStatus): KnownBookReadStatus {
  if (!BOOK_READ_STATUS_SET.has(status)) {
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
  requestedStatus: KnownBookReadStatus,
): readonly SetBookReadStatusResult[] {
  if (!Array.isArray(response)) {
    throw new Error('Invalid book read-status response.');
  }

  const requested = new Set(requestedBookIds);
  const seen = new Set<number>();
  const results = response.map(decodeReadStatusResult);
  for (const result of results) {
    if (!requested.has(result.bookId)
      || seen.has(result.bookId)
      || result.readStatus !== requestedStatus) {
      throw new Error('Invalid book read-status response.');
    }
    seen.add(result.bookId);
  }

  return results;
}

function decodeBookDeletionResult(
  response: unknown,
  requestedBookIds: readonly number[],
): DeleteBooksResult {
  if (!isRecord(response)
    || !Array.isArray(response['deleted'])
    || !Array.isArray(response['failedFileDeletions'])) {
    throw new Error('Invalid book-deletion response.');
  }
  const requested = new Set(requestedBookIds);
  const removedBookIds = decodeRequestedBookIdSubset(response['deleted'], requested);
  if (removedBookIds === null) {
    throw new Error('Invalid book-deletion response.');
  }
  const fileCleanupFailedBookIds = decodeRequestedBookIdSubset(
    response['failedFileDeletions'],
    requested,
  );
  if (fileCleanupFailedBookIds === null) {
    throw new Error('Invalid book-deletion response.');
  }
  return {
    removedBookIds,
    fileCleanupFailedBookIds,
  };
}

function decodeRequestedBookIdSubset(
  values: readonly unknown[],
  requested: ReadonlySet<number>,
): readonly number[] | null {
  const seen = new Set<number>();
  for (const bookId of values) {
    if (!isPositiveSafeInteger(bookId) || !requested.has(bookId)) {
      return null;
    }
    seen.add(bookId);
  }
  return [...seen];
}

function decodeReadStatusResult(response: unknown): SetBookReadStatusResult {
  if (!isRecord(response)
    || !isPositiveSafeInteger(response['bookId'])
    || typeof response['readStatus'] !== 'string'
    || !BOOK_READ_STATUS_SET.has(response['readStatus'] as KnownBookReadStatus)) {
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
    readStatus: response['readStatus'] as KnownBookReadStatus,
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
  const results = response.map(result => {
    if (!isRecord(result)
      || !isPositiveSafeInteger(result['bookId'])
      || result['readStatus'] !== null
      || result['dateFinished'] !== null) {
      throw new Error('Invalid book reset-progress response.');
    }
    const readStatusModifiedTime = decodeRequiredNullableString(
      result,
      'readStatusModifiedTime',
      'Invalid book reset-progress response.',
    );

    const bookId = result['bookId'];
    if (!requested.has(bookId) || seen.has(bookId)) {
      throw new Error('Invalid book reset-progress response.');
    }
    seen.add(bookId);

    return {
      bookId,
      source,
      readStatusModifiedTime,
    };
  });
  return results;
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

function decodeRequiredNullableString(
  response: Record<string, unknown>,
  field: string,
  errorMessage: string,
): string | null {
  const value = response[field];
  if (!Object.hasOwn(response, field)
    || (value !== null && typeof value !== 'string')) {
    throw new Error(errorMessage);
  }
  return value;
}
