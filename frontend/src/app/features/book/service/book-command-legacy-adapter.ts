import {
  CreateMutationOptions,
  DefaultError,
  WithRequired,
} from '@tanstack/angular-query-experimental';

import {
  BulkBookCommandPartialError,
  DeleteBooksResult,
  SetBookMetadataFieldLocksResult,
  SetAllBookMetadataLocksResult,
  SetBookReadStatusResult,
  ResetBookProgressResult,
} from '../data/book-command.models';
import {
  CombineBooksResult,
  OrganizeBookFilesResult,
} from '../data/book-file-command.models';
import {UpdateBookShelfMembershipResult} from '../data/book-shelf-command.models';
import {
  invalidateAllLegacyBooks,
  invalidateLegacyChangedBooks,
  removeLegacyDeletedBooks,
} from './legacy-book-cache';

export interface LegacyBookInvalidation {
  readonly changedBookIds?: readonly number[];
  readonly deletedBookIds?: readonly number[];
  readonly allBooks?: boolean;
}

export function withLegacyBookInvalidation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>(
  options: WithRequired<
    CreateMutationOptions<TData, TError, TVariables, TOnMutateResult>,
    'mutationKey'
  >,
  select: (data: TData, variables: TVariables) => LegacyBookInvalidation,
): WithRequired<
  CreateMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  'mutationKey'
> {
  const originalOnSuccess = options.onSuccess;
  const originalOnError = options.onError;

  return {
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      applyLegacyInvalidation(context.client, select(data, variables));
      await originalOnSuccess?.(data, variables, onMutateResult, context);
    },
    onError: async (error, variables, onMutateResult, context) => {
      if (error instanceof BulkBookCommandPartialError) {
        applyLegacyInvalidation(context.client, select(error.completed as TData, variables));
      }
      await originalOnError?.(error, variables, onMutateResult, context);
    },
  };
}

function applyLegacyInvalidation(
  client: Parameters<typeof invalidateAllLegacyBooks>[0],
  invalidation: LegacyBookInvalidation,
): void {
  if (invalidation.allBooks) {
    invalidateAllLegacyBooks(client);
    return;
  }

  const deletedBookIds = new Set(invalidation.deletedBookIds ?? []);
  const changedBookIds = new Set(invalidation.changedBookIds ?? []);
  for (const bookId of deletedBookIds) {
    changedBookIds.delete(bookId);
  }

  if (deletedBookIds.size > 0) {
    removeLegacyDeletedBooks(client, deletedBookIds);
  }
  if (changedBookIds.size > 0) {
    invalidateLegacyChangedBooks(client, changedBookIds);
  }
}

export const legacyBookInvalidationSelectors = {
  readStatus: (
    results: readonly SetBookReadStatusResult[],
  ): LegacyBookInvalidation => ({changedBookIds: results.map(result => result.bookId)}),
  deleteBooks: (
    result: DeleteBooksResult,
  ): LegacyBookInvalidation => ({deletedBookIds: result.removedBookIds}),
  resetProgress: (
    results: readonly ResetBookProgressResult[],
  ): LegacyBookInvalidation => ({changedBookIds: results.map(result => result.bookId)}),
  metadataFieldLocks: (
    result: SetBookMetadataFieldLocksResult,
  ): LegacyBookInvalidation => ({changedBookIds: result.bookIds}),
  metadataAllLocks: (
    results: readonly SetAllBookMetadataLocksResult[],
  ): LegacyBookInvalidation => ({changedBookIds: results.map(result => result.bookId)}),
  shelfMembership: (
    result: UpdateBookShelfMembershipResult,
  ): LegacyBookInvalidation => ({changedBookIds: result.confirmedBookIds}),
  combineBooks: (
    result: CombineBooksResult,
  ): LegacyBookInvalidation => ({
    changedBookIds: [result.targetBookId],
    deletedBookIds: result.removedSourceBookIds,
  }),
  organizeFiles: (
    result: OrganizeBookFilesResult,
  ): LegacyBookInvalidation => ({changedBookIds: result.acknowledgedBookIds}),
} as const;
