import {
  CreateMutationOptions,
  DefaultError,
  QueryClient,
  WithRequired,
} from '@tanstack/angular-query-experimental';

import {
  BulkBookCommandPartialError,
  BOOK_METADATA_LOCK_FIELDS,
  BookMetadataLockField,
  DeleteBooksResult,
  ResetBookProgressResult,
  SetAllBookMetadataLocksResult,
  SetBookMetadataFieldLocksVariables,
  SetBookReadStatusResult,
} from '../data/book-command.models';
import {UpdateBookShelfMembershipResult} from '../data/book-shelf-command.models';
import {BookShelf} from '../data/book-response.models';
import {Book, ReadStatus} from '../model/book.model';
import {Shelf} from '../model/shelf.model';
import {SortDirection} from '../model/sort.model';
import {
  awaitBookCacheReconciliations,
  patchListOnlyBookFields,
  patchListOnlyBooksWith,
  removeListOnlyBooks,
} from './legacy-book-cache';
import {SHELVES_QUERY_KEY} from './shelf.service';

type LegacyBookCachePatch<TData, TVariables> = (
  client: QueryClient,
  data: TData,
  variables: TVariables,
) => unknown;

export function withLegacyBookCache<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>(
  options: WithRequired<
    CreateMutationOptions<TData, TError, TVariables, TOnMutateResult>,
    'mutationKey'
  >,
  patch: LegacyBookCachePatch<TData, TVariables>,
): WithRequired<
  CreateMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  'mutationKey'
> {
  const originalOnSuccess = options.onSuccess;
  const originalOnError = options.onError;

  return {
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      await awaitBookCacheReconciliations([
        () => patch(context.client, data, variables),
        () => originalOnSuccess?.(data, variables, onMutateResult, context),
      ]);
    },
    onError: async (error, variables, onMutateResult, context) => {
      await awaitBookCacheReconciliations([
        () => error instanceof BulkBookCommandPartialError
          ? patch(context.client, error.completed as TData, variables)
          : undefined,
        () => originalOnError?.(error, variables, onMutateResult, context),
      ]);
    },
  };
}

export const legacyBookCachePatches = {
  readStatus: (
    client: QueryClient,
    results: readonly SetBookReadStatusResult[],
  ): Promise<void> => patchListOnlyBookFields(client, results.map(result => ({
    bookId: result.bookId,
    fields: {
      readStatus: ReadStatus[result.readStatus],
      ...(result.readStatusModifiedTime !== undefined
        ? {readStatusModifiedTime: result.readStatusModifiedTime ?? undefined}
        : {}),
      ...(result.dateFinished !== undefined
        ? {dateFinished: result.dateFinished ?? undefined}
        : {}),
    },
  }))),
  deleteBooks: (
    client: QueryClient,
    result: DeleteBooksResult,
  ): Promise<void> => removeListOnlyBooks(client, result.removedBookIds),
  resetProgress: (
    client: QueryClient,
    results: readonly ResetBookProgressResult[],
  ): Promise<void> => patchListOnlyBookFields(client, results.map(result => ({
    bookId: result.bookId,
    fields: {
      ...resetProgressFields(result.source),
      readStatus: undefined,
      readStatusModifiedTime: result.readStatusModifiedTime ?? undefined,
      dateFinished: undefined,
    },
  }))),
  metadataFieldLocks: (
    client: QueryClient,
    _result: void,
    variables: SetBookMetadataFieldLocksVariables,
  ): Promise<void> => {
    const lockedFields = BOOK_METADATA_LOCK_FIELDS.flatMap(field => {
      const locked = variables.fieldLocks[field];
      return locked === undefined ? [] : [{field: legacyMetadataLockField(field), locked}];
    });
    return patchListOnlyBooksWith(client, variables.bookIds.map(bookId => ({
      bookId,
      updater: book => {
        if (!book.metadata) {
          return book;
        }
        const metadata = {...book.metadata};
        for (const {field, locked} of lockedFields) {
          if (field in metadata) {
            metadata[field] = locked;
          }
        }
        return {...book, metadata};
      },
    })));
  },
  metadataAllLocks: (
    client: QueryClient,
    results: readonly SetAllBookMetadataLocksResult[],
  ): Promise<void> => patchListOnlyBooksWith(client, results.map(result => ({
    bookId: result.bookId,
    updater: book => {
      if (!book.metadata) {
        return book;
      }
      return {
        ...book,
        metadata: {...book.metadata, ...result.metadataLocks},
      };
    },
  }))),
  shelfMembership: (
    client: QueryClient,
    result: UpdateBookShelfMembershipResult,
  ): Promise<void> => patchLegacyShelfMembership(client, result),
} as const;

function resetProgressFields(source: ResetBookProgressResult['source']): Partial<Book> {
  if (source === 'KOREADER') {
    return {koreaderProgress: undefined};
  }
  if (source === 'KOBO') {
    return {koboProgress: undefined};
  }
  return {
    epubProgress: undefined,
    pdfProgress: undefined,
    cbxProgress: undefined,
    audiobookProgress: undefined,
  };
}

function patchLegacyShelfMembership(
  client: QueryClient,
  result: UpdateBookShelfMembershipResult,
): Promise<void> {
  return awaitBookCacheReconciliations([
    () => patchListOnlyBooksWith(client, result.updatedBookShelves.map(update => ({
      bookId: update.bookId,
      updater: book => {
        const existingShelves = new Map((book.shelves ?? []).map(shelf => [shelf.id, shelf]));
        return {
          ...book,
          shelves: update.shelves.map(shelf => toLegacyShelf(shelf, existingShelves.get(shelf.id))),
        };
      },
    }))),
    () => client.invalidateQueries({queryKey: SHELVES_QUERY_KEY, exact: true}),
  ]);
}

function legacyMetadataLockField(field: BookMetadataLockField): string {
  return field === 'thumbnail' ? 'coverLocked' : `${field}Locked`;
}

function toLegacyShelf(shelf: BookShelf, existing: Shelf | undefined): Shelf {
  return {
    id: shelf.id,
    name: shelf.name,
    ...(shelf.icon !== undefined ? {icon: shelf.icon} : {}),
    ...(shelf.iconType !== undefined ? {iconType: shelf.iconType as Shelf['iconType']} : {}),
    ...(shelf.userId !== undefined ? {userId: shelf.userId} : {}),
    publicShelf: shelf.publicShelf,
    bookCount: shelf.bookCount,
    ...(shelf.sort?.field && shelf.sort.direction ? {sort: {
      field: shelf.sort.field,
      direction: shelf.sort.direction === 'ASCENDING'
        ? SortDirection.ASCENDING
        : SortDirection.DESCENDING,
    }} : {}),
    ...(existing?.systemKey ? {systemKey: existing.systemKey} : {}),
  };
}
