import {TestBed} from '@angular/core/testing';
import {
  mutationOptions,
  MutationFunctionContext,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {createQueryClientHarness} from '../../../core/testing/query-testing';
import {BulkBookCommandPartialError} from '../data/book-command.models';
import {BookCommandService} from '../data/book-command.service';
import {bookQueryKeys} from '../data/book-query-keys';
import {
  legacyBookInvalidationSelectors,
  withLegacyBookInvalidation,
} from './book-command-legacy-adapter';
import {
  BOOKS_QUERY_KEY,
  bookDetailQueryPrefix,
  bookRecommendationsQueryPrefix,
} from './book-query-keys';

function mutationContext(
  queryClient: QueryClient,
  mutationKey: readonly unknown[] = ['test'],
): MutationFunctionContext {
  return {
    client: queryClient,
    meta: undefined,
    mutationKey,
  };
}

describe('legacy book command adapter', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('applies legacy-only effects before calling the original onSuccess with identical arguments', async () => {
    const callOrder: string[] = [];
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(options => {
      callOrder.push(`invalidate:${JSON.stringify(options?.queryKey)}`);
      return Promise.resolve();
    });
    const originalOnSuccess = vi.fn(async (
      data: {readonly bookId: number},
      variables: {readonly requestedBookId: number},
      onMutateResult: {readonly snapshot: string},
      context: MutationFunctionContext,
    ) => {
      expect(data.bookId).toBe(7);
      expect(variables.requestedBookId).toBe(7);
      expect(onMutateResult.snapshot).toBe('before');
      expect(context.client).toBe(queryClient);
      callOrder.push('original');
    });
    const options = mutationOptions({
      mutationKey: ['test', 'changed'],
      mutationFn: async (variables: {readonly requestedBookId: number}) => ({
        bookId: variables.requestedBookId,
      }),
      onMutate: () => ({snapshot: 'before'}),
      onSuccess: originalOnSuccess,
    });
    const wrapped = withLegacyBookInvalidation(
      options,
      data => ({changedBookIds: [data.bookId]}),
    );
    const data = {bookId: 7};
    const variables = {requestedBookId: 7};
    const onMutateResult = {snapshot: 'before'};
    const context = mutationContext(queryClient, options.mutationKey);

    await wrapped.onSuccess?.(data, variables, onMutateResult, context);

    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(7)});
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: ['app-books']});
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: ['app-filter-options']});
    expect(originalOnSuccess).toHaveBeenCalledWith(data, variables, onMutateResult, context);
    expect(callOrder.at(-1)).toBe('original');
  });

  it('propagates rejection from the original onSuccess', async () => {
    const failure = new Error('clean reconciliation failed');
    const options = mutationOptions({
      mutationKey: ['test', 'reject'],
      mutationFn: async (variables: {readonly bookId: number}) => variables.bookId,
      onSuccess: () => Promise.reject(failure),
    });
    const wrapped = withLegacyBookInvalidation(
      options,
      data => ({changedBookIds: [data]}),
    );

    await expect(wrapped.onSuccess?.(
      4,
      {bookId: 4},
      undefined,
      mutationContext(queryClient, options.mutationKey),
    )).rejects.toBe(failure);
  });

  it('lets all-books invalidation override changed and deleted ID lists', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const removeQueries = vi.spyOn(queryClient, 'removeQueries');
    const options = mutationOptions({
      mutationKey: ['test', 'all'],
      mutationFn: async () => true,
    });
    const wrapped = withLegacyBookInvalidation(options, () => ({
      allBooks: true,
      changedBookIds: [1],
      deletedBookIds: [2],
    }));

    await wrapped.onSuccess?.(true, undefined, undefined, mutationContext(queryClient));

    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: BOOKS_QUERY_KEY, exact: true});
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: ['books', 'detail']});
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: ['books', 'recommendations']});
    expect(invalidateQueries).not.toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(1)});
    expect(removeQueries).not.toHaveBeenCalled();
  });

  it('lets deletion win when changed and deleted ID lists overlap', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const removeQueries = vi.spyOn(queryClient, 'removeQueries');
    const options = mutationOptions({
      mutationKey: ['test', 'overlap'],
      mutationFn: async () => true,
    });
    const wrapped = withLegacyBookInvalidation(options, () => ({
      changedBookIds: [1, 2],
      deletedBookIds: [2, 3],
    }));

    await wrapped.onSuccess?.(true, undefined, undefined, mutationContext(queryClient));

    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(1)});
    expect(invalidateQueries).not.toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(2)});
    for (const bookId of [2, 3]) {
      expect(removeQueries).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(bookId)});
      expect(removeQueries).toHaveBeenCalledWith({queryKey: bookRecommendationsQueryPrefix(bookId)});
    }
  });

  it('bridges a partial bulk failure to the legacy caches before the original onError', async () => {
    const callOrder: string[] = [];
    const removeQueries = vi.spyOn(queryClient, 'removeQueries').mockImplementation(() => {
      callOrder.push('remove');
      return Promise.resolve();
    });
    const originalOnError = vi.fn(async () => {
      callOrder.push('original');
    });
    const options = mutationOptions({
      mutationKey: ['test', 'partial'],
      mutationFn: async (variables: {readonly bookIds: readonly number[]}) => ({
        removedBookIds: variables.bookIds,
        fileCleanupFailedBookIds: [] as readonly number[],
      }),
      onError: originalOnError,
    });
    const wrapped = withLegacyBookInvalidation(options, legacyBookInvalidationSelectors.deleteBooks);
    const partial = new BulkBookCommandPartialError(
      {removedBookIds: [1, 2], fileCleanupFailedBookIds: []},
      [3, 4],
      new Error('chunk failed'),
    );

    await wrapped.onError?.(partial, {bookIds: [1, 2, 3, 4]}, undefined, mutationContext(queryClient));

    for (const bookId of [1, 2]) {
      expect(removeQueries).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(bookId)});
    }
    expect(originalOnError).toHaveBeenCalledOnce();
    expect(callOrder.at(-1)).toBe('original');
  });

  it('applies no legacy invalidation for a non-partial error', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const removeQueries = vi.spyOn(queryClient, 'removeQueries');
    const originalOnError = vi.fn();
    const options = mutationOptions({
      mutationKey: ['test', 'plain-error'],
      mutationFn: async () => true,
      onError: originalOnError,
    });
    const wrapped = withLegacyBookInvalidation(options, () => ({changedBookIds: [1]}));

    await wrapped.onError?.(new Error('nope'), undefined, undefined, mutationContext(queryClient));

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(removeQueries).not.toHaveBeenCalled();
    expect(originalOnError).toHaveBeenCalledOnce();
  });

  it('maps every kept book-changing command to authoritative result IDs', () => {
    expect(legacyBookInvalidationSelectors.readStatus(
      [
        {bookId: 4, readStatus: 'READ'},
        {bookId: 7, readStatus: 'READ'},
      ],
    )).toEqual({changedBookIds: [4, 7]});

    expect(legacyBookInvalidationSelectors.deleteBooks(
      {removedBookIds: [2, 5], fileCleanupFailedBookIds: [5]},
    )).toEqual({deletedBookIds: [2, 5]});

    expect(legacyBookInvalidationSelectors.resetProgress(
      [
        {bookId: 3, source: 'KOREADER'},
        {bookId: 8, source: 'KOREADER'},
      ],
    )).toEqual({changedBookIds: [3, 8]});

    expect(legacyBookInvalidationSelectors.metadataFieldLocks(
      {bookIds: [6, 9], fieldLocks: {title: true}},
    )).toEqual({changedBookIds: [6, 9]});

    expect(legacyBookInvalidationSelectors.metadataAllLocks(
      [
        {bookId: 1, locked: true},
        {bookId: 10, locked: true},
      ],
    )).toEqual({changedBookIds: [1, 10]});

    expect(legacyBookInvalidationSelectors.shelfMembership(
      {confirmedBookIds: [11], assignedShelfIds: [4], unassignedShelfIds: [5]},
    )).toEqual({changedBookIds: [11]});

    expect(legacyBookInvalidationSelectors.combineBooks(
      {targetBookId: 20, removedSourceBookIds: [21, 22]},
    )).toEqual({changedBookIds: [20], deletedBookIds: [21, 22]});

    expect(legacyBookInvalidationSelectors.organizeFiles(
      {acknowledgedBookIds: [30, 31]},
    )).toEqual({changedBookIds: [30, 31]});
  });

  it('does not double-invalidate clean cache keys around a real clean command', async () => {
    const harness = createQueryClientHarness();
    TestBed.configureTestingModule({
      providers: [...harness.providers, BookCommandService],
    });
    const commands = TestBed.inject(BookCommandService);
    const unwrappedClient = new QueryClient();
    const wrappedClient = new QueryClient();
    const unwrappedInvalidate = vi.spyOn(unwrappedClient, 'invalidateQueries');
    const wrappedInvalidate = vi.spyOn(wrappedClient, 'invalidateQueries');
    const unwrapped = commands.setReadStatus();
    const wrapped = withLegacyBookInvalidation(
      commands.setReadStatus(),
      legacyBookInvalidationSelectors.readStatus,
    );
    const results = [{bookId: 5, readStatus: 'READ' as const}];
    const variables = {bookIds: [5], status: 'READ' as const};

    await unwrapped.onSuccess?.(
      results,
      variables,
      undefined,
      mutationContext(unwrappedClient, unwrapped.mutationKey),
    );
    await wrapped.onSuccess?.(
      results,
      variables,
      undefined,
      mutationContext(wrappedClient, wrapped.mutationKey),
    );

    const cleanKeys = [
      bookQueryKeys.collections(),
      bookQueryKeys.detailQueries(5),
      bookQueryKeys.batches(),
      bookQueryKeys.recommendations(),
    ];
    for (const queryKey of cleanKeys) {
      const serializedQueryKey = JSON.stringify(queryKey);
      const unwrappedCount = unwrappedInvalidate.mock.calls
        .filter(([filters]) => JSON.stringify(filters?.queryKey) === serializedQueryKey).length;
      const wrappedCount = wrappedInvalidate.mock.calls
        .filter(([filters]) => JSON.stringify(filters?.queryKey) === serializedQueryKey).length;
      expect(wrappedCount).toBe(unwrappedCount);
      expect(wrappedCount).toBe(1);
    }
  });
});
