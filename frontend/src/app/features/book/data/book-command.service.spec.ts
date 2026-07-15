import {HttpErrorResponse} from '@angular/common/http';
import {HttpTestingController, TestRequest} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {
  injectMutation,
  QueryClient,
  QueryObserver,
} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {bookCommandKeys, bookCommandScopes} from './book-command-keys';
import {bookQueryKeys} from './book-query-keys';
import {normalizeBookBatchParams, normalizeBookPageParams} from './book-query-params';
import {
  BulkBookCommandPartialError,
  BookCommandValidationError,
  DeleteBooksResult,
  SetBookReadStatusResult,
  ResetBookProgressResult,
} from './book-command.models';
import {BookCommandService} from './book-command.service';

@Injectable()
class BookCommandHost {
  private readonly commands = inject(BookCommandService);
  readonly setReadStatus = injectMutation(() => this.commands.setReadStatus());
  readonly resetProgress = injectMutation(() => this.commands.resetProgress());
  readonly deleteBooks = injectMutation(() => this.commands.deleteBooks());
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
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

function resetProgressResponse(bookId: number, readStatusModifiedTime: string | null = null) {
  return {
    bookId,
    readStatus: null,
    readStatusModifiedTime,
    dateFinished: null,
  };
}

const commandPageKey = bookQueryKeys.boundedPage(normalizeBookPageParams({
  facets: {any: {}, must: {}, not: {}},
  sort: [],
  size: 20,
}));

describe('BookCommandService', () => {
  let host: BookCommandHost;
  let service: BookCommandService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;

    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        BookCommandService,
        BookCommandHost,
      ],
    });

    host = TestBed.inject(BookCommandHost);
    service = TestBed.inject(BookCommandService);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('removes every requested book after deletion and preserves file-cleanup warnings', async () => {
    const resultPromise = host.deleteBooks.mutateAsync({bookIds: [9, 3, 9, 5]});
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<DeleteBooksResult>>();
    const request = await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=9,3,5`,
    );
    expect(request.request.method).toBe('DELETE');
    request.flush({deleted: [9, 3, 5], failedFileDeletions: [3, 3]});

    await expect(resultPromise).resolves.toEqual({
      removedBookIds: [9, 3, 5],
      fileCleanupFailedBookIds: [3],
    });
    for (const bookId of [9, 3, 5]) {
      expect(queryClient.getQueryData(bookQueryKeys.detail(bookId, false))).toBeUndefined();
    }
  });

  it('accepts a deletion acknowledging only the books the server still had', async () => {
    const removedDetailKey = bookQueryKeys.detail(9, false);
    const skippedDetailKey = bookQueryKeys.detail(3, false);
    queryClient.setQueryData(removedDetailKey, {id: 9});
    queryClient.setQueryData(skippedDetailKey, {id: 3});
    const resultPromise = host.deleteBooks.mutateAsync({bookIds: [9, 3]});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=9,3`,
    )).flush({deleted: [9], failedFileDeletions: []});

    await expect(resultPromise).resolves.toEqual({
      removedBookIds: [9],
      fileCleanupFailedBookIds: [],
    });
    expect(queryClient.getQueryData(removedDetailKey)).toBeUndefined();
    expect(queryClient.getQueryData(skippedDetailKey)).toEqual({id: 3});
    expect(queryClient.getQueryState(skippedDetailKey)?.isInvalidated).toBe(true);
  });

  it('deletes 201 IDs sequentially in 200/1 chunks and composes the results', async () => {
    const bookIds = Array.from({length: 201}, (_, index) => index + 1);
    const firstChunk = bookIds.slice(0, 200);
    const resultPromise = host.deleteBooks.mutateAsync({bookIds});
    const firstRequest = await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=${firstChunk.join(',')}`,
    );
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books?ids=201`);
    firstRequest.flush({deleted: firstChunk, failedFileDeletions: [17]});
    const secondRequest = await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=201`,
    );
    secondRequest.flush({deleted: [201], failedFileDeletions: [201]});

    await expect(resultPromise).resolves.toEqual({
      removedBookIds: bookIds,
      fileCleanupFailedBookIds: [17, 201],
    });
  });

  it('reconciles completed deletion chunks and reports the failing and unsent IDs', async () => {
    const bookIds = Array.from({length: 401}, (_, index) => index + 1);
    const firstChunk = bookIds.slice(0, 200);
    const secondChunk = bookIds.slice(200, 400);
    const completedDetailKey = bookQueryKeys.detail(1, false);
    const failedDetailKey = bookQueryKeys.detail(201, false);
    const unsentDetailKey = bookQueryKeys.detail(401, false);
    const completedRecommendationsKey = bookQueryKeys.recommendation(1, 20);
    const survivingRecommendationsKey = bookQueryKeys.recommendation(201, 20);
    const batchKey = bookQueryKeys.batch(normalizeBookBatchParams([1, 201, 401], false));
    queryClient.setQueryData(commandPageKey, {content: [{id: 1}, {id: 201}, {id: 401}]});
    queryClient.setQueryData(batchKey, [{id: 1}, {id: 201}, {id: 401}]);
    queryClient.setQueryData(completedDetailKey, {id: 1});
    queryClient.setQueryData(failedDetailKey, {id: 201});
    queryClient.setQueryData(unsentDetailKey, {id: 401});
    queryClient.setQueryData(completedRecommendationsKey, [{book: {id: 201}}]);
    queryClient.setQueryData(survivingRecommendationsKey, [{book: {id: 1}}]);
    const resultPromise = host.deleteBooks.mutateAsync({bookIds});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=${firstChunk.join(',')}`,
    )).flush({deleted: firstChunk, failedFileDeletions: [17]});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=${secondChunk.join(',')}`,
    )).flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books?ids=401`);

    const error: unknown = await resultPromise.catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BulkBookCommandPartialError);
    if (!(error instanceof BulkBookCommandPartialError)) {
      throw new Error('Expected a partial bulk command error.');
    }
    expect(error.completed).toEqual({
      removedBookIds: firstChunk,
      fileCleanupFailedBookIds: [17],
    });
    expect(error.attemptedBookIds).toEqual(secondChunk);
    expect(error.unsentBookIds).toEqual([401]);
    expect(error.cause).toBeInstanceOf(HttpErrorResponse);
    expect(queryClient.getQueryData(completedDetailKey)).toBeUndefined();
    expect(queryClient.getQueryData(completedRecommendationsKey)).toBeUndefined();
    expect(queryClient.getQueryData(failedDetailKey)).toEqual({id: 201});
    expect(queryClient.getQueryData(unsentDetailKey)).toEqual({id: 401});
    expect(queryClient.getQueryState(failedDetailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(commandPageKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(batchKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(survivingRecommendationsKey)?.isInvalidated).toBe(true);
  });

  it('uses the fail-safe path for an HTTP error in the first deletion chunk', async () => {
    const bookIds = Array.from({length: 201}, (_, index) => index + 1);
    const firstDetailKey = bookQueryKeys.detail(1, false);
    const laterDetailKey = bookQueryKeys.detail(201, false);
    queryClient.setQueryData(firstDetailKey, {id: 1});
    queryClient.setQueryData(laterDetailKey, {id: 201});
    const resultPromise = host.deleteBooks.mutateAsync({bookIds});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=${bookIds.slice(0, 200).join(',')}`,
    )).flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books?ids=201`);

    await expect(resultPromise).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(queryClient.getQueryState(firstDetailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(laterDetailKey)?.isInvalidated).toBe(true);
  });

  it.each([
    {response: null, label: 'missing response'},
    {response: {failedFileDeletions: []}, label: 'missing deleted acknowledgement'},
    {response: {deleted: [0], failedFileDeletions: []}, label: 'invalid deleted acknowledgement'},
    {response: {deleted: [2], failedFileDeletions: []}, label: 'unexpected deleted acknowledgement'},
    {response: {deleted: [1]}, label: 'missing file-cleanup warnings'},
    {response: {deleted: [1], failedFileDeletions: [0]}, label: 'invalid warning ID'},
    {response: {deleted: [1], failedFileDeletions: [2]}, label: 'unrequested warning ID'},
  ])('rejects a deletion response with $label', async ({response}) => {
    const resultPromise = host.deleteBooks.mutateAsync({bookIds: [1]});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=1`,
    )).flush(response);

    await expect(resultPromise).rejects.toThrow('Invalid book-deletion response.');
  });

  it('keeps an ambiguously deleted book cached but invalidates it for refetch', async () => {
    const detailKey = bookQueryKeys.detail(1, false);
    queryClient.setQueryData(detailKey, {id: 1});
    const resultPromise = host.deleteBooks.mutateAsync({bookIds: [1]});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=1`,
    )).flush(null);

    await expect(resultPromise).rejects.toThrow('Invalid book-deletion response.');
    expect(queryClient.getQueryData(detailKey)).toEqual({id: 1});
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it('pins stable mutation keys, scopes and disabled retries on every command', () => {
    const deletion = service.deleteBooks();
    const status = service.setReadStatus();
    const reset = service.resetProgress();

    expect(deletion.scope).toBe(bookCommandScopes.deletion);
    expect(status.scope).toBe(bookCommandScopes.readingState);
    expect(reset.mutationKey).toEqual(bookCommandKeys.resetProgress());
    expect(reset.scope).toBe(bookCommandScopes.readingState);
    expect([deletion, status, reset].every(options => options.retry === false)).toBe(true);
  });

  it('posts normalized IDs and returns explicit clean result values', async () => {
    const resultPromise = host.setReadStatus.mutateAsync({
      bookIds: [9, 3, 9, 5],
      status: 'READ',
    });
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<readonly SetBookReadStatusResult[]>>();
    const request = await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/status`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      bookIds: [9, 3, 5],
      status: 'READ',
    });
    request.flush([
      {
        bookId: 9,
        readStatus: 'READ',
      },
      {
        bookId: 3,
        readStatus: 'READ',
        readStatusModifiedTime: '2026-07-10T08:00:00Z',
      },
      {
        bookId: 5,
        readStatus: 'READ',
        readStatusModifiedTime: null,
        dateFinished: null,
      },
    ]);

    await expect(resultPromise).resolves.toEqual([
      {
        bookId: 9,
        readStatus: 'READ',
      },
      {
        bookId: 3,
        readStatus: 'READ',
        readStatusModifiedTime: '2026-07-10T08:00:00Z',
      },
      {
        bookId: 5,
        readStatus: 'READ',
        readStatusModifiedTime: null,
        dateFinished: null,
      },
    ]);
  });

  it.each([
    {response: [{bookId: 0, readStatus: 'READ'}], label: 'invalid book ID'},
    {response: [{bookId: 3, readStatus: 'FINISHED'}], label: 'invalid read status'},
    {response: [{bookId: 3, readStatus: 'READ', dateFinished: 123}], label: 'invalid date'},
    {response: [{bookId: 4, readStatus: 'READ'}], label: 'unexpected book ID'},
    {response: [{bookId: 3, readStatus: 'READ'}, {bookId: 3, readStatus: 'READ'}], label: 'duplicate book ID'},
    {response: [{bookId: 3, readStatus: 'PAUSED'}], label: 'mismatched read status'},
  ])('rejects a read-status response with $label', async ({response}) => {
    const resultPromise = host.setReadStatus.mutateAsync({bookIds: [3], status: 'READ'});
    (await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/status`)).flush(response);

    await expect(resultPromise).rejects.toThrow('Invalid book read-status response.');
  });

  it('accepts a read-status response acknowledging only some requested books', async () => {
    const resultPromise = host.setReadStatus.mutateAsync({bookIds: [3, 9], status: 'READ'});
    (await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/status`)).flush([
      {bookId: 3, readStatus: 'READ'},
    ]);

    await expect(resultPromise).resolves.toEqual([{bookId: 3, readStatus: 'READ'}]);
  });

  it('invalidates affected query state after a malformed dispatched read-status response', async () => {
    const detailKey = bookQueryKeys.detail(3, false);
    const batchKey = bookQueryKeys.batch(normalizeBookBatchParams([3], false));
    const recommendationsKey = bookQueryKeys.recommendation(9, 20);
    queryClient.setQueryData(commandPageKey, {content: [{id: 3}]});
    queryClient.setQueryData(detailKey, {id: 3});
    queryClient.setQueryData(batchKey, [{id: 3}]);
    queryClient.setQueryData(recommendationsKey, [{book: {id: 3}}]);
    const resultPromise = host.setReadStatus.mutateAsync({bookIds: [3], status: 'READ'});
    (await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/status`)).flush([
      {bookId: 4, readStatus: 'READ'},
    ]);

    await expect(resultPromise).rejects.toThrow('Invalid book read-status response.');
    expect(queryClient.getQueryState(commandPageKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(batchKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(recommendationsKey)?.isInvalidated).toBe(true);
  });

  it.each([
    {bookIds: [], label: 'empty IDs', message: 'At least one book ID is required.'},
    {bookIds: [0], label: 'zero ID', message: 'Book ID must be a positive integer.'},
    {bookIds: [-1], label: 'negative ID', message: 'Book ID must be a positive integer.'},
    {bookIds: [1.5], label: 'non-integer ID', message: 'Book ID must be a positive integer.'},
    {
      bookIds: [Number.MAX_SAFE_INTEGER + 1],
      label: 'unsafe integer ID',
      message: 'Book ID must be a positive integer.',
    },
  ])('rejects $label before transport', async ({bookIds, message}) => {
    const error: unknown = await host.setReadStatus.mutateAsync({
      bookIds,
      status: 'READING',
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BookCommandValidationError);
    expect(error).toHaveProperty('message', message);
    http.expectNone(() => true);
  });

  it('rejects an unsupported read status before transport', async () => {
    const detailKey = bookQueryKeys.detail(1, false);
    queryClient.setQueryData(detailKey, {id: 1});
    const error: unknown = await host.setReadStatus.mutateAsync({
      bookIds: [1],
      status: 'FINISHED' as never,
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BookCommandValidationError);
    expect(error).toHaveProperty('message', 'Unsupported book read status: FINISHED');
    http.expectNone(() => true);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(false);
  });

  it('propagates transport errors after invalidating the uncertain book state', async () => {
    const detailKey = bookQueryKeys.detail(4, false);
    queryClient.setQueryData(detailKey, {id: 4});
    const resultPromise = host.setReadStatus.mutateAsync({
      bookIds: [4],
      status: 'PAUSED',
    });
    const request = await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/status`);
    request.flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await expect(resultPromise).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it('keeps the mutation and FIFO scope pending until active queries refetch', async () => {
    const pageRefetch = deferred<{content: readonly {id: number}[]}>();
    const detailRefetch = deferred<{id: number}>();
    const detailKey = bookQueryKeys.detail(1, false);
    queryClient.setQueryData(commandPageKey, {content: [{id: 1}]});
    queryClient.setQueryData(detailKey, {id: 1});
    const pageObserver = new QueryObserver(queryClient, {
      queryKey: commandPageKey,
      staleTime: Infinity,
      queryFn: () => pageRefetch.promise,
    });
    const detailObserver = new QueryObserver(queryClient, {
      queryKey: detailKey,
      staleTime: Infinity,
      queryFn: () => detailRefetch.promise,
    });
    const unsubscribePage = pageObserver.subscribe(() => undefined);
    const unsubscribeDetail = detailObserver.subscribe(() => undefined);
    const firstResult = host.setReadStatus.mutateAsync({bookIds: [1], status: 'UNREAD'});
    const secondResult = host.setReadStatus.mutateAsync({bookIds: [2], status: 'READING'});
    (await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/status`)).flush([
      {bookId: 1, readStatus: 'UNREAD'},
    ]);

    await vi.waitFor(() => {
      expect(pageObserver.getCurrentResult().isFetching).toBe(true);
      expect(detailObserver.getCurrentResult().isFetching).toBe(true);
    });
    flushSignalAndQueryEffects();
    expect(host.setReadStatus.isPending()).toBe(true);
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books/status`);

    pageRefetch.resolve({content: [{id: 1}]});
    detailRefetch.resolve({id: 1});
    await expect(firstResult).resolves.toEqual([{bookId: 1, readStatus: 'UNREAD'}]);
    const secondRequest = await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/status`,
    );
    expect(secondRequest.request.body).toEqual({bookIds: [2], status: 'READING'});
    secondRequest.flush([{bookId: 2, readStatus: 'READING'}]);
    await expect(secondResult).resolves.toEqual([{bookId: 2, readStatus: 'READING'}]);
    unsubscribePage();
    unsubscribeDetail();
  });

  it('keeps the FIFO scope pending while an uncertain failure reconciles', async () => {
    const reconciliation = deferred<void>();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      .mockReturnValue(reconciliation.promise);
    const firstResult = host.setReadStatus.mutateAsync({
      bookIds: [4],
      status: 'READING',
    });
    void firstResult.catch(() => undefined);
    const secondResult = host.setReadStatus.mutateAsync({
      bookIds: [5],
      status: 'UNREAD',
    });
    const firstRequest = await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/status`,
    );
    expect(firstRequest.request.body).toEqual({bookIds: [4], status: 'READING'});
    firstRequest.flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await vi.waitFor(() => expect(invalidateQueries).toHaveBeenCalled());
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books/status`);
    flushSignalAndQueryEffects();
    expect(host.setReadStatus.isPending()).toBe(true);

    reconciliation.resolve();
    await expect(firstResult).rejects.toBeInstanceOf(HttpErrorResponse);
    const secondRequest = await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/status`,
    );
    expect(secondRequest.request.body).toEqual({bookIds: [5], status: 'UNREAD'});
    secondRequest.flush([{bookId: 5, readStatus: 'UNREAD'}]);

    await expect(secondResult).resolves.toEqual([{bookId: 5, readStatus: 'UNREAD'}]);
  });

  describe('resetProgress', () => {
    it.each([
      {source: 'GRIMMORY' as const, backendType: 'BOOKLORE'},
      {source: 'KOREADER' as const, backendType: 'KOREADER'},
      {source: 'KOBO' as const, backendType: 'KOBO'},
    ])('posts normalized IDs for $source using backend type $backendType', async ({
      source,
      backendType,
    }) => {
      const resultPromise = host.resetProgress.mutateAsync({
        bookIds: [9, 3, 9, 5],
        source,
      });
      expectTypeOf(resultPromise).toEqualTypeOf<Promise<readonly ResetBookProgressResult[]>>();
      const request = await expectOneEventually(
        http,
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=${backendType}`,
      );
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual([9, 3, 5]);
      request.flush([
        resetProgressResponse(9),
        resetProgressResponse(3, '2026-07-10T08:00:00Z'),
        resetProgressResponse(5),
      ]);

      await expect(resultPromise).resolves.toEqual([
        {bookId: 9, source, readStatusModifiedTime: null},
        {bookId: 3, source, readStatusModifiedTime: '2026-07-10T08:00:00Z'},
        {bookId: 5, source, readStatusModifiedTime: null},
      ]);
    });

    it.each([
      {response: null, label: 'non-array body'},
      {response: [{bookId: 0}], label: 'zero book ID'},
      {response: [resetProgressResponse(3)], label: 'unexpected book ID'},
      {response: [resetProgressResponse(2), resetProgressResponse(2)], label: 'duplicate book ID'},
      {
        response: [{bookId: 2, readStatusModifiedTime: null, dateFinished: null}],
        label: 'missing read status',
      },
      {
        response: [{bookId: 2, readStatus: null, dateFinished: null}],
        label: 'missing modified time',
      },
      {
        response: [{bookId: 2, readStatus: null, readStatusModifiedTime: null}],
        label: 'missing finished date',
      },
      {
        response: [{...resetProgressResponse(2), readStatusModifiedTime: 1}],
        label: 'invalid modified time',
      },
    ])('rejects a reset-progress response with $label', async ({response}) => {
      const resultPromise = host.resetProgress.mutateAsync({
        bookIds: [2],
        source: 'GRIMMORY',
      });
      (await expectOneEventually(
        http,
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=BOOKLORE`,
      )).flush(response);

      await expect(resultPromise).rejects.toThrow('Invalid book reset-progress response.');
    });

    it('invalidates attempted books after a malformed dispatched reset response', async () => {
      const detailKey = bookQueryKeys.detail(2, false);
      queryClient.setQueryData(detailKey, {id: 2});
      const resultPromise = host.resetProgress.mutateAsync({
        bookIds: [2],
        source: 'GRIMMORY',
      });
      (await expectOneEventually(
        http,
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=BOOKLORE`,
      )).flush([resetProgressResponse(3)]);

      await expect(resultPromise).rejects.toThrow('Invalid book reset-progress response.');
      expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
    });

    it('resets 501 IDs sequentially in 500/1 chunks and composes the results', async () => {
      const bookIds = Array.from({length: 501}, (_, index) => index + 1);
      const resultPromise = host.resetProgress.mutateAsync({
        bookIds,
        source: 'KOREADER',
      });
      const firstRequest = await expectOneEventually(
        http,
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=KOREADER`,
      );
      expect(firstRequest.request.body).toEqual(bookIds.slice(0, 500));
      firstRequest.flush(bookIds.slice(0, 500).map(bookId => resetProgressResponse(bookId)));
      const secondRequest = await expectOneEventually(
        http,
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=KOREADER`,
      );
      expect(secondRequest.request.body).toEqual([501]);
      secondRequest.flush([resetProgressResponse(501)]);

      await expect(resultPromise).resolves.toEqual(
        bookIds.map(bookId => ({bookId, source: 'KOREADER', readStatusModifiedTime: null})),
      );
    });

    it('reconciles completed reset chunks and reports the failing and unsent IDs', async () => {
      const bookIds = Array.from({length: 1001}, (_, index) => index + 1);
      const firstResults = bookIds.slice(0, 500).map(bookId => resetProgressResponse(bookId));
      const completedDetailKey = bookQueryKeys.detail(1, false);
      const failedDetailKey = bookQueryKeys.detail(501, false);
      const unsentDetailKey = bookQueryKeys.detail(1001, false);
      const batchKey = bookQueryKeys.batch(normalizeBookBatchParams([1, 501, 1001], false));
      const recommendationsKey = bookQueryKeys.recommendation(501, 20);
      queryClient.setQueryData(commandPageKey, {content: [{id: 1}, {id: 501}, {id: 1001}]});
      queryClient.setQueryData(batchKey, [{id: 1}, {id: 501}, {id: 1001}]);
      queryClient.setQueryData(completedDetailKey, {id: 1});
      queryClient.setQueryData(failedDetailKey, {id: 501});
      queryClient.setQueryData(unsentDetailKey, {id: 1001});
      queryClient.setQueryData(recommendationsKey, [{book: {id: 1}}]);
      const resultPromise = host.resetProgress.mutateAsync({
        bookIds,
        source: 'KOBO',
      });
      const firstRequest = await expectOneEventually(
        http,
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=KOBO`,
      );
      expect(firstRequest.request.body).toEqual(bookIds.slice(0, 500));
      firstRequest.flush(firstResults);
      const secondRequest = await expectOneEventually(
        http,
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=KOBO`,
      );
      expect(secondRequest.request.body).toEqual(bookIds.slice(500, 1000));
      secondRequest.flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

      const error: unknown = await resultPromise.catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(BulkBookCommandPartialError);
      if (!(error instanceof BulkBookCommandPartialError)) {
        throw new Error('Expected a partial bulk command error.');
      }
      expect(error.completed).toEqual(firstResults.map(({bookId, readStatusModifiedTime}) => ({
        bookId,
        source: 'KOBO',
        readStatusModifiedTime,
      })));
      expect(error.attemptedBookIds).toEqual(bookIds.slice(500, 1000));
      expect(error.unsentBookIds).toEqual([1001]);
      expect(error.cause).toBeInstanceOf(HttpErrorResponse);
      expect(queryClient.getQueryState(completedDetailKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(failedDetailKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(unsentDetailKey)?.isInvalidated).toBe(false);
      expect(queryClient.getQueryState(commandPageKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(batchKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(recommendationsKey)?.isInvalidated).toBe(true);
    });

    it('rejects an unsupported source before transport', async () => {
      const error: unknown = await host.resetProgress.mutateAsync({
        bookIds: [1],
        source: 'BOOKLORE' as never,
      }).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(BookCommandValidationError);
      expect(error).toHaveProperty('message', 'Unsupported reset-progress source: BOOKLORE');
      http.expectNone(() => true);
    });

    it('serializes reset progress behind read-status reconciliation', async () => {
      const reconciliation = deferred<void>();
      vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(reconciliation.promise);
      const statusResult = host.setReadStatus.mutateAsync({bookIds: [1], status: 'READ'});
      const resetResult = host.resetProgress.mutateAsync({bookIds: [1], source: 'GRIMMORY'});
      (await expectOneEventually(http, `${API_CONFIG.BASE_URL}/api/v1/books/status`)).flush([
        {bookId: 1, readStatus: 'READ'},
      ]);
      await vi.waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalled());
      http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=BOOKLORE`);

      reconciliation.resolve();
      await expect(statusResult).resolves.toEqual([{bookId: 1, readStatus: 'READ'}]);
      (await expectOneEventually(
        http,
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=BOOKLORE`,
      )).flush([resetProgressResponse(1)]);
      await expect(resetResult).resolves.toEqual([{
        bookId: 1,
        source: 'GRIMMORY',
        readStatusModifiedTime: null,
      }]);
    });
  });
});
