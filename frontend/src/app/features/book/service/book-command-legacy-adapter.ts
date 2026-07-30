import {
  CreateMutationOptions,
  DefaultError,
  QueryClient,
  WithRequired,
} from '@tanstack/angular-query-experimental';

import {
  BulkBookCommandPartialError,
  DeleteBooksResult,
  ResetBookProgressResult,
  SetAllBookMetadataLocksResult,
  SetBookReadStatusResult,
} from '../data/book-command.models';
import {UpdateBookShelfMembershipResult} from '../data/book-shelf-command.models';
import {BookShelf} from '../data/book-response.models';
import {Book, ReadStatus} from '../model/book.model';
import {Shelf} from '../model/shelf.model';
import {SortDirection} from '../model/sort.model';
import {
  invalidateAllLegacyBooks,
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
      await Promise.all([
        patch(context.client, data, variables),
        originalOnSuccess?.(data, variables, onMutateResult, context),
      ]);
    },
    onError: async (error, variables, onMutateResult, context) => {
      await Promise.all([
        error instanceof BulkBookCommandPartialError
          ? patch(context.client, error.completed as TData, variables)
          : undefined,
        invalidateAllLegacyBooks(context.client),
        originalOnError?.(error, variables, onMutateResult, context),
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
      readStatusModifiedTime: result.readStatusModifiedTime ?? undefined,
      dateFinished: result.dateFinished ?? undefined,
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
    fields: result.source === 'GRIMMORY'
      ? {
          ...resetProgressFields(result.source),
          readStatus: undefined,
          readStatusModifiedTime: result.readStatusModifiedTime ?? undefined,
          dateFinished: undefined,
          lastReadTime: undefined,
        }
      : resetProgressFields(result.source),
  }))),
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

async function patchLegacyShelfMembership(
  client: QueryClient,
  result: UpdateBookShelfMembershipResult,
): Promise<void> {
  await Promise.all([
    patchListOnlyBooksWith(client, result.updatedBookShelves.map(update => ({
      bookId: update.bookId,
      updater: book => ({
        ...book,
        shelves: update.shelves.map(toLegacyShelf),
      }),
    }))),
    client.invalidateQueries({queryKey: SHELVES_QUERY_KEY, exact: true}),
  ]);
}

function toLegacyShelf(shelf: BookShelf): Shelf {
  return {
    id: shelf.id,
    name: shelf.name,
    ...(shelf.icon !== undefined ? {icon: shelf.icon} : {}),
    ...(shelf.iconType !== undefined ? {iconType: shelf.iconType as Shelf['iconType']} : {}),
    userId: shelf.userId,
    publicShelf: shelf.publicShelf,
    bookCount: shelf.bookCount,
    ...(shelf.sort ? {sort: {
      field: shelf.sort.field!,
      direction: shelf.sort.direction === 'ASCENDING'
        ? SortDirection.ASCENDING
        : SortDirection.DESCENDING,
    }} : {}),
  };
}
