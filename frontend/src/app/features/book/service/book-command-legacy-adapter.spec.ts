import {HttpErrorResponse} from '@angular/common/http';
import {HttpTestingController, TestRequest} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {
  injectMutation,
  mutationOptions,
  MutationFunctionContext,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {BookCommandValidationError, BulkBookCommandPartialError} from '../data/book-command.models';
import {BookCommandService} from '../data/book-command.service';
import {bookQueryKeys} from '../data/book-query-keys';
import {BookShelfCommandService} from '../data/book-shelf-command.service';
import {
  legacyBookCachePatches,
  withLegacyBookCache,
} from './book-command-legacy-adapter';
import {Book, ReadStatus} from '../model/book.model';
import {
  BOOKS_QUERY_KEY,
  bookDetailQueryPrefix,
  bookRecommendationsQueryPrefix,
} from './book-query-keys';
import {reconcileLegacyBookChangeSet} from './legacy-book-cache';
import {SHELVES_QUERY_KEY} from './shelf.service';

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

async function expectOneEventually(
  http: HttpTestingController,
  url: string,
): Promise<TestRequest> {
  let request: TestRequest | undefined;
  await vi.waitFor(() => {
    const matches = http.match(url);
    expect(matches).toHaveLength(1);
    [request] = matches;
  });
  return request!;
}

@Injectable()
class LegacyBookCommandHost {
  private readonly commands = inject(BookCommandService);
  private readonly shelfCommands = inject(BookShelfCommandService);
  readonly setReadStatus = injectMutation(() => withLegacyBookCache(
    this.commands.setReadStatus(),
    legacyBookCachePatches.readStatus,
  ));
  readonly deleteBooks = injectMutation(() => withLegacyBookCache(
    this.commands.deleteBooks(),
    legacyBookCachePatches.deleteBooks,
  ));
  readonly resetProgress = injectMutation(() => withLegacyBookCache(
    this.commands.resetProgress(),
    legacyBookCachePatches.resetProgress,
  ));
  readonly setMetadataFieldLocks = injectMutation(() => withLegacyBookCache(
    this.commands.setMetadataFieldLocks(),
    legacyBookCachePatches.metadataFieldLocks,
  ));
  readonly setAllMetadataLocks = injectMutation(() => withLegacyBookCache(
    this.commands.setAllMetadataLocks(),
    legacyBookCachePatches.metadataAllLocks,
  ));
  readonly updateShelfMembership = injectMutation(() => withLegacyBookCache(
    this.shelfCommands.updateMembership(),
    legacyBookCachePatches.shelfMembership,
  ));
}

function setupAdapterHost() {
  const harness = createQueryClientHarness();
  TestBed.configureTestingModule({
    providers: [
      ...harness.providers,
      BookCommandService,
      BookShelfCommandService,
      LegacyBookCommandHost,
    ],
  });
  return {
    harness,
    host: TestBed.inject(LegacyBookCommandHost),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('legacy book command adapter', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('patches the legacy all-books cache after a confirmed read-status command', async () => {
    const {harness, host, http} = setupAdapterHost();
    const originalBook: Book = {
      id: 5,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.UNREAD,
    };
    harness.queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [originalBook]);
    flushSignalAndQueryEffects();

    const resultPromise = host.setReadStatus.mutateAsync({bookIds: [5], status: 'READ'});
    (await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/status`)).flush([{
      bookId: 5,
      readStatus: 'READ',
      readStatusModifiedTime: '2026-07-18T10:00:00Z',
      dateFinished: '2026-07-18T10:00:00Z',
    }]);
    await resultPromise;

    expect(harness.queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([{
      ...originalBook,
      readStatus: 'READ',
      readStatusModifiedTime: '2026-07-18T10:00:00Z',
      dateFinished: '2026-07-18T10:00:00Z',
    }]);
    expect(harness.queryClient.getQueryState(BOOKS_QUERY_KEY)?.isInvalidated).toBe(false);
    http.verify();
  });

  it('attempts and awaits permanent-cache reconciliation when legacy success reconciliation throws', async () => {
    const legacyFailure = new Error('legacy reconciliation failed');
    let finishCleanReconciliation!: () => void;
    const permanentReconciliation = new Promise<void>(resolve => {
      finishCleanReconciliation = resolve;
    });
    const originalOnSuccess = vi.fn((
      data: {readonly bookId: number},
      variables: {readonly requestedBookId: number},
      onMutateResult: {readonly snapshot: string},
      context: MutationFunctionContext,
    ) => {
      expect(data.bookId).toBe(7);
      expect(variables.requestedBookId).toBe(7);
      expect(onMutateResult.snapshot).toBe('before');
      expect(context.client).toBe(queryClient);
      return permanentReconciliation;
    });
    const options = mutationOptions({
      mutationKey: ['test', 'changed'],
      mutationFn: async (variables: {readonly requestedBookId: number}) => ({
        bookId: variables.requestedBookId,
      }),
      onMutate: () => ({snapshot: 'before'}),
      onSuccess: originalOnSuccess,
    });
    const wrapped = withLegacyBookCache(
      options,
      () => {
        throw legacyFailure;
      },
    );
    const data = {bookId: 7};
    const variables = {requestedBookId: 7};
    const onMutateResult = {snapshot: 'before'};
    const context = mutationContext(queryClient, options.mutationKey);

    const reconciliation = Promise.resolve(wrapped.onSuccess?.(
      data,
      variables,
      onMutateResult,
      context,
    ));
    let settled = false;
    void reconciliation.finally(() => {
      settled = true;
    }).catch(() => undefined);
    await vi.waitFor(() => expect(originalOnSuccess).toHaveBeenCalledOnce());

    expect(originalOnSuccess).toHaveBeenCalledWith(data, variables, onMutateResult, context);
    expect(settled).toBe(false);

    finishCleanReconciliation();
    await expect(reconciliation).rejects.toBe(legacyFailure);
  });

  it('propagates rejection from the original onSuccess', async () => {
    const failure = new Error('permanent-cache reconciliation failed');
    const options = mutationOptions({
      mutationKey: ['test', 'reject'],
      mutationFn: async (variables: {readonly bookId: number}) => variables.bookId,
      onSuccess: () => Promise.reject(failure),
    });
    const wrapped = withLegacyBookCache(
      options,
      () => undefined,
    );

    await expect(wrapped.onSuccess?.(
      4,
      {bookId: 4},
      undefined,
      mutationContext(queryClient, options.mutationKey),
    )).rejects.toBe(failure);
  });

  it('lets deletion win when changed and deleted ID lists overlap', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const removeQueries = vi.spyOn(queryClient, 'removeQueries');
    const options = mutationOptions({
      mutationKey: ['test', 'overlap'],
      mutationFn: async () => true,
    });
    const wrapped = withLegacyBookCache(options, client =>
      reconcileLegacyBookChangeSet(client, {
        changedBookIds: [1, 2],
        deletedBookIds: [2, 3],
      })
    );

    await wrapped.onSuccess?.(true, undefined, undefined, mutationContext(queryClient));

    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(1)});
    expect(invalidateQueries).not.toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(2)});
    for (const bookId of [2, 3]) {
      expect(removeQueries).toHaveBeenCalledWith({queryKey: bookDetailQueryPrefix(bookId)});
      expect(removeQueries).toHaveBeenCalledWith({queryKey: bookRecommendationsQueryPrefix(bookId)});
    }
  });

  it('attempts permanent-cache error reconciliation when a legacy partial patch fails', async () => {
    const legacyFailure = new Error('legacy reconciliation failed');
    const originalOnError = vi.fn(async () => undefined);
    const options = mutationOptions({
      mutationKey: ['test', 'partial'],
      mutationFn: async (variables: {readonly bookIds: readonly number[]}) => ({
        removedBookIds: variables.bookIds,
        fileCleanupFailedBookIds: [] as readonly number[],
      }),
      onError: originalOnError,
    });
    const wrapped = withLegacyBookCache(
      options,
      () => {
        throw legacyFailure;
      },
    );
    const partial = new BulkBookCommandPartialError(
      {removedBookIds: [1, 2], fileCleanupFailedBookIds: []},
      [3, 4],
      [],
      new Error('chunk failed'),
    );

    await expect(wrapped.onError?.(
      partial,
      {bookIds: [1, 2, 3, 4]},
      undefined,
      mutationContext(queryClient),
    )).rejects.toBe(legacyFailure);

    expect(originalOnError).toHaveBeenCalledOnce();
  });

  it('removes confirmed deletions from the legacy all-books cache without refetching it', async () => {
    const {harness, host, http} = setupAdapterHost();
    const kept: Book = {id: 6, libraryId: 1, libraryName: 'Library'};
    harness.queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [
      {id: 5, libraryId: 1, libraryName: 'Library'},
      kept,
    ]);
    flushSignalAndQueryEffects();

    const resultPromise = host.deleteBooks.mutateAsync({bookIds: [5]});
    (await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books?ids=5`)).flush({
      deleted: [5],
      failedFileDeletions: [],
    });
    await resultPromise;

    expect(harness.queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([kept]);
    expect(harness.queryClient.getQueryState(BOOKS_QUERY_KEY)?.isInvalidated).toBe(false);
    http.verify();
  });

  it('patches the progress fields known to have been reset without refetching all books', async () => {
    const {harness, host, http} = setupAdapterHost();
    harness.queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [{
      id: 5,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.READING,
      koreaderProgress: {percentage: 42},
      pdfProgress: {page: 7, percentage: 12},
      dateFinished: '2026-07-01T10:00:00Z',
    }]);
    flushSignalAndQueryEffects();

    const resultPromise = host.resetProgress.mutateAsync({bookIds: [5], source: 'KOREADER'});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=KOREADER`,
    )).flush([{
      bookId: 5,
      readStatus: null,
      readStatusModifiedTime: '2026-07-18T10:00:00Z',
      dateFinished: null,
    }]);
    await resultPromise;

    expect(harness.queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)).toEqual([{
      id: 5,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: undefined,
      readStatusModifiedTime: '2026-07-18T10:00:00Z',
      koreaderProgress: undefined,
      pdfProgress: {page: 7, percentage: 12},
      dateFinished: undefined,
    }]);
    expect(harness.queryClient.getQueryState(BOOKS_QUERY_KEY)?.isInvalidated).toBe(false);
    http.verify();
  });

  it('patches confirmed metadata locks without refetching all books', async () => {
    const {harness, host, http} = setupAdapterHost();
    harness.queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [{
      id: 5,
      libraryId: 1,
      libraryName: 'Library',
      metadata: {
        bookId: 5,
        title: 'Book',
        titleLocked: false,
        coverLocked: false,
        allMetadataLocked: false,
      },
    }, {
      id: 6,
      libraryId: 1,
      libraryName: 'Library',
    }]);
    flushSignalAndQueryEffects();

    const fieldResult = host.setMetadataFieldLocks.mutateAsync({
      bookIds: [5],
      fieldLocks: {thumbnail: true},
    });
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-field-locks`,
    )).flush(null);
    await fieldResult;

    expect(harness.queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)?.[0].metadata).toMatchObject({
      titleLocked: false,
      coverLocked: true,
    });
    expect(harness.queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)?.[0].metadata)
      .not.toHaveProperty('thumbnailLocked');

    const allResult = host.setAllMetadataLocks.mutateAsync({bookIds: [5], locked: true});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-all-lock`,
    )).flush([{
      bookId: 5,
      allMetadataLocked: true,
      titleLocked: true,
      coverLocked: true,
      doubanIdLocked: false,
      externalUrlLocked: false,
    }]);
    await allResult;

    expect(harness.queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)?.[0].metadata).toMatchObject({
      titleLocked: true,
      coverLocked: true,
      doubanIdLocked: false,
      externalUrlLocked: false,
      allMetadataLocked: true,
    });
    expect(harness.queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)?.[1].metadata).toBeUndefined();
    expect(harness.queryClient.getQueryState(BOOKS_QUERY_KEY)?.isInvalidated).toBe(false);
    http.verify();
  });

  it('patches confirmed shelf membership from the backend result', async () => {
    const {harness, host, http} = setupAdapterHost();
    harness.queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [{
      id: 5,
      libraryId: 1,
      libraryName: 'Library',
      shelves: [{id: 2, name: 'Old', publicShelf: false, bookCount: 1}],
    }]);
    harness.queryClient.setQueryData(SHELVES_QUERY_KEY, [{id: 2, name: 'Old'}]);
    flushSignalAndQueryEffects();

    const resultPromise = host.updateShelfMembership.mutateAsync({
      bookIds: [5],
      assignShelfIds: [4],
      unassignShelfIds: [2],
    });
    (await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/shelves`)).flush([{
      id: 5,
      libraryId: 1,
      libraryName: 'Library',
      shelves: [{
        id: 4,
        name: 'Favourites',
        icon: 'heart',
        iconType: 'LUCIDE',
        publicShelf: false,
        bookCount: 4,
        sort: {field: 'addedOn', direction: 'DESCENDING'},
      }],
    }]);
    await resultPromise;

    expect(harness.queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)?.[0].shelves).toEqual([{
      id: 4,
      name: 'Favourites',
      icon: 'heart',
      iconType: 'LUCIDE',
      publicShelf: false,
      bookCount: 4,
      sort: {field: 'addedOn', direction: 'DESCENDING'},
    }]);
    expect(harness.queryClient.getQueryState(BOOKS_QUERY_KEY)?.isInvalidated).toBe(false);
    expect(harness.queryClient.getQueryState(SHELVES_QUERY_KEY)?.isInvalidated).toBe(true);
    http.verify();
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
    const wrapped = withLegacyBookCache(
      commands.setReadStatus(),
      legacyBookCachePatches.readStatus,
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

  it('leaves both cache families untouched when command validation fails before transport', async () => {
    const {harness, host, http} = setupAdapterHost();
    const legacyDetailKey = [...bookDetailQueryPrefix(5), false] as const;
    const cleanDetailKey = bookQueryKeys.detail(5, false);
    harness.queryClient.setQueryData(legacyDetailKey, {id: 5});
    harness.queryClient.setQueryData(cleanDetailKey, {id: 5});
    flushSignalAndQueryEffects();

    const error: unknown = await host.setReadStatus.mutateAsync({
      bookIds: [],
      status: 'READ',
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BookCommandValidationError);
    expect(error).toHaveProperty('message', 'At least one book ID is required.');
    http.expectNone(() => true);
    expect(harness.queryClient.getQueryState(legacyDetailKey)?.isInvalidated).toBe(false);
    expect(harness.queryClient.getQueryState(cleanDetailKey)?.isInvalidated).toBe(false);
    http.verify();
  });

  it('leaves legacy caches unchanged when a dispatched command fails', async () => {
    const {harness, host, http} = setupAdapterHost();
    const variables = {bookIds: [5], status: 'READ' as const};
    const legacyDetailKey = bookDetailQueryPrefix(5);
    const cleanDetailKey = bookQueryKeys.detail(5, false);
    harness.queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [{
      id: 5,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.UNREAD,
    }]);
    harness.queryClient.setQueryData([...legacyDetailKey, false], {id: 5});
    harness.queryClient.setQueryData(cleanDetailKey, {id: 5});
    flushSignalAndQueryEffects();

    const resultPromise = host.setReadStatus.mutateAsync(variables);
    (await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/status`))
      .flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await expect(resultPromise).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(harness.queryClient.getQueryState(BOOKS_QUERY_KEY)?.isInvalidated).toBe(false);
    expect(harness.queryClient.getQueryState([...legacyDetailKey, false])?.isInvalidated).toBe(false);
    expect(harness.queryClient.getQueryState(cleanDetailKey)?.isInvalidated).toBe(true);
    http.verify();
  });

  it('patches confirmed partial deletions without touching uncertain or unattempted legacy books', async () => {
    const {harness, host, http} = setupAdapterHost();
    const bookIds = Array.from({length: 401}, (_, index) => index + 1);
    const firstChunk = bookIds.slice(0, 200);
    const secondChunk = bookIds.slice(200, 400);
    const variables = {bookIds};
    const legacyKeys = new Map([1, 201, 401].map(bookId => [
      bookId,
      [...bookDetailQueryPrefix(bookId), false] as const,
    ]));
    const cleanKeys = new Map([1, 201, 401].map(bookId => [
      bookId,
      bookQueryKeys.detail(bookId, false),
    ]));
    harness.queryClient.setQueryData<Book[]>(BOOKS_QUERY_KEY, [1, 201, 401].map(id => ({
      id,
      libraryId: 1,
      libraryName: 'Library',
    })));
    for (const [bookId, queryKey] of [...legacyKeys, ...cleanKeys]) {
      harness.queryClient.setQueryData(queryKey, {id: bookId});
    }
    flushSignalAndQueryEffects();

    const resultPromise = host.deleteBooks.mutateAsync(variables);
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=${firstChunk.join(',')}`,
    ))
      .flush({deleted: firstChunk, failedFileDeletions: []});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=${secondChunk.join(',')}`,
    ))
      .flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books?ids=401`);
    await expect(resultPromise).rejects.toBeInstanceOf(BulkBookCommandPartialError);
    expect(harness.queryClient.getQueryData<Book[]>(BOOKS_QUERY_KEY)?.map(book => book.id))
      .toEqual([201, 401]);
    expect(harness.queryClient.getQueryState(BOOKS_QUERY_KEY)?.isInvalidated).toBe(false);
    expect(harness.queryClient.getQueryData(legacyKeys.get(1)!)).toBeUndefined();
    expect(harness.queryClient.getQueryData(cleanKeys.get(1)!)).toBeUndefined();
    expect(harness.queryClient.getQueryState(legacyKeys.get(201)!)?.isInvalidated).toBe(false);
    expect(harness.queryClient.getQueryState(cleanKeys.get(201)!)?.isInvalidated).toBe(true);
    expect(harness.queryClient.getQueryState(legacyKeys.get(401)!)?.isInvalidated).toBe(false);
    expect(harness.queryClient.getQueryState(cleanKeys.get(401)!)?.isInvalidated).toBe(false);
    http.verify();
  });
});
