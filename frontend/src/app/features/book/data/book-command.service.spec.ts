import {HttpErrorResponse} from '@angular/common/http';
import {HttpTestingController} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {
  injectMutation,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {bookCommandKeys, bookCommandScopes} from './book-command-keys';
import {bookQueryKeys} from './book-query-keys';
import {
  BulkBookCommandPartialError,
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

async function flushMutationStart(): Promise<void> {
  await Promise.resolve();
}

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
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books?ids=9,3,5`);
    expect(request.request.method).toBe('DELETE');
    request.flush({deleted: [999], failedFileDeletions: [3]});

    await expect(resultPromise).resolves.toEqual({
      removedBookIds: [9, 3, 5],
      fileCleanupFailedBookIds: [3],
    });
    for (const bookId of [9, 3, 5]) {
      expect(queryClient.getQueryData(bookQueryKeys.detail(bookId, false))).toBeUndefined();
    }
  });

  it('deletes 201 IDs sequentially in 200/1 chunks and composes the results', async () => {
    const bookIds = Array.from({length: 201}, (_, index) => index + 1);
    const firstChunk = bookIds.slice(0, 200);
    const resultPromise = host.deleteBooks.mutateAsync({bookIds});
    await flushMutationStart();

    const firstRequest = http.expectOne(
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=${firstChunk.join(',')}`,
    );
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books?ids=201`);
    firstRequest.flush({failedFileDeletions: [17]});
    await flushMutationStart();

    const secondRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books?ids=201`);
    secondRequest.flush({failedFileDeletions: [201]});

    await expect(resultPromise).resolves.toEqual({
      removedBookIds: bookIds,
      fileCleanupFailedBookIds: [17, 201],
    });
  });

  it('reconciles completed deletion chunks and reports the failing and unsent IDs', async () => {
    const bookIds = Array.from({length: 401}, (_, index) => index + 1);
    const firstChunk = bookIds.slice(0, 200);
    const secondChunk = bookIds.slice(200, 400);
    const removeQueries = vi.spyOn(queryClient, 'removeQueries');
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.deleteBooks.mutateAsync({bookIds});
    await flushMutationStart();

    http.expectOne(
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=${firstChunk.join(',')}`,
    ).flush({failedFileDeletions: [17]});
    await flushMutationStart();
    http.expectOne(
      `${API_CONFIG.BASE_URL}/api/v1/books?ids=${secondChunk.join(',')}`,
    ).flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});
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
    expect(error.failedBookIds).toEqual(bookIds.slice(200));
    expect(error.cause).toBeInstanceOf(HttpErrorResponse);
    expect(removeQueries).toHaveBeenCalledTimes(400);
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
  });

  it.each([
    {response: null, label: 'missing response'},
    {response: {deleted: [1]}, label: 'missing file-cleanup warnings'},
    {response: {deleted: [1], failedFileDeletions: [0]}, label: 'invalid warning ID'},
    {response: {deleted: [1], failedFileDeletions: [2]}, label: 'unrequested warning ID'},
    {response: {deleted: [1], failedFileDeletions: [1, 1]}, label: 'duplicate warning ID'},
  ])('rejects a deletion response with $label before reconciliation', async ({response}) => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.deleteBooks.mutateAsync({bookIds: [1]});
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books?ids=1`).flush(response);

    await expect(resultPromise).rejects.toThrow('Invalid book-deletion response.');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('pins stable mutation keys, scopes and disabled retries on every command', () => {
    const deletion = service.deleteBooks();
    const status = service.setReadStatus();
    const reset = service.resetProgress();

    expect(deletion.mutationKey).toEqual(bookCommandKeys.deleteBooks());
    expect(deletion.scope).toBe(bookCommandScopes.deletion);
    expect(status.mutationKey).toEqual(bookCommandKeys.readStatus());
    expect(status.scope).toBe(bookCommandScopes.readingState);
    expect(reset.mutationKey).toEqual(bookCommandKeys.resetProgress());
    expect(reset.scope).toBe(bookCommandScopes.readingState);
    expect(deletion.retry).toBe(false);
    expect(status.retry).toBe(false);
    expect(reset.retry).toBe(false);
  });

  it('posts normalized IDs and returns explicit clean result values', async () => {
    const resultPromise = host.setReadStatus.mutateAsync({
      bookIds: [9, 3, 9, 5],
      status: 'READ',
    });
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<readonly SetBookReadStatusResult[]>>();
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`);
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
    {response: [], label: 'missing acknowledgement'},
    {response: [{bookId: 4, readStatus: 'READ'}], label: 'unexpected book ID'},
    {response: [{bookId: 3, readStatus: 'READ'}, {bookId: 3, readStatus: 'READ'}], label: 'duplicate book ID'},
    {response: [{bookId: 3, readStatus: 'PAUSED'}], label: 'mismatched read status'},
  ])('rejects a read-status response with $label before reconciliation', async ({response}) => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.setReadStatus.mutateAsync({bookIds: [3], status: 'READ'});
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`).flush(response);

    await expect(resultPromise).rejects.toThrow('Invalid book read-status response.');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it.each([
    {bookIds: [], label: 'empty IDs'},
    {bookIds: [0], label: 'zero ID'},
    {bookIds: [-1], label: 'negative ID'},
    {bookIds: [1.5], label: 'non-integer ID'},
    {bookIds: [Number.MAX_SAFE_INTEGER + 1], label: 'unsafe integer ID'},
  ])('rejects $label before transport', async ({bookIds}) => {
    await expect(host.setReadStatus.mutateAsync({
      bookIds,
      status: 'READING',
    })).rejects.toThrow();

    http.expectNone(() => true);
  });

  it('rejects an unsupported read status before transport', async () => {
    await expect(host.setReadStatus.mutateAsync({
      bookIds: [1],
      status: 'FINISHED' as never,
    })).rejects.toThrow('Unsupported book read status: FINISHED');

    http.expectNone(() => true);
  });

  it('propagates transport errors without reconciling the query cache', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.setReadStatus.mutateAsync({
      bookIds: [4],
      status: 'PAUSED',
    });
    await flushMutationStart();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`);
    request.flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await expect(resultPromise).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('stays pending until cache reconciliation for authoritative result IDs completes', async () => {
    const reconciliation = deferred<void>();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      .mockReturnValue(reconciliation.promise);
    const resultPromise = host.setReadStatus.mutateAsync({
      bookIds: [1, 2],
      status: 'UNREAD',
    });
    await flushMutationStart();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`);
    request.flush([
      {
        bookId: 2,
        readStatus: 'UNREAD',
        readStatusModifiedTime: '2026-07-10T09:00:00Z',
        dateFinished: null,
      },
      {
        bookId: 1,
        readStatus: 'UNREAD',
        readStatusModifiedTime: '2026-07-10T09:00:00Z',
        dateFinished: null,
      },
    ]);

    await vi.waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: bookQueryKeys.detailQueries(2),
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: bookQueryKeys.detailQueries(1),
      });
    });
    flushSignalAndQueryEffects();
    expect(host.setReadStatus.isPending()).toBe(true);

    reconciliation.resolve();

    await expect(resultPromise).resolves.toHaveLength(2);
  });

  it('releases the next read-status command after an HTTP failure without reconciling it', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const firstResult = host.setReadStatus.mutateAsync({
      bookIds: [4],
      status: 'READING',
    });
    void firstResult.catch(() => undefined);
    const secondResult = host.setReadStatus.mutateAsync({
      bookIds: [5],
      status: 'UNREAD',
    });
    await flushMutationStart();

    const firstRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`);
    expect(firstRequest.request.body).toEqual({bookIds: [4], status: 'READING'});
    firstRequest.flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await expect(firstResult).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(invalidateQueries).not.toHaveBeenCalled();
    await flushMutationStart();
    const secondRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`);
    expect(secondRequest.request.body).toEqual({bookIds: [5], status: 'UNREAD'});
    secondRequest.flush([{bookId: 5, readStatus: 'UNREAD'}]);

    await expect(secondResult).resolves.toEqual([{bookId: 5, readStatus: 'UNREAD'}]);
    expect(invalidateQueries).toHaveBeenCalled();
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
      await flushMutationStart();

      const request = http.expectOne(
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=${backendType}`,
      );
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual([9, 3, 5]);
      request.flush([
        {
          bookId: 3,
          readStatus: 'READ',
          dateFinished: '2026-07-10T08:00:00Z',
        },
        {
          bookId: 5,
          readStatus: 'UNREAD',
          dateFinished: null,
        },
      ]);

      await expect(resultPromise).resolves.toEqual([
        {bookId: 3, source},
        {bookId: 5, source},
      ]);
    });

    it.each([
      {response: null, label: 'non-array body'},
      {response: [{bookId: 0}], label: 'zero book ID'},
      {response: [{bookId: -1}], label: 'negative book ID'},
      {response: [{bookId: 1.5}], label: 'fractional book ID'},
      {response: [{bookId: Number.MAX_SAFE_INTEGER + 1}], label: 'unsafe book ID'},
      {response: [{}], label: 'missing book ID'},
      {response: [{bookId: 3}], label: 'unexpected book ID'},
      {response: [{bookId: 2}, {bookId: 2}], label: 'duplicate book ID'},
    ])('rejects a reset-progress response with $label before reconciliation', async ({response}) => {
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
      const resultPromise = host.resetProgress.mutateAsync({
        bookIds: [2],
        source: 'GRIMMORY',
      });
      await flushMutationStart();
      http.expectOne(
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=BOOKLORE`,
      ).flush(response);

      await expect(resultPromise).rejects.toThrow('Invalid book reset-progress response.');
      expect(invalidateQueries).not.toHaveBeenCalled();
    });

    it('resets 501 IDs sequentially in 500/1 chunks and composes the results', async () => {
      const bookIds = Array.from({length: 501}, (_, index) => index + 1);
      const resultPromise = host.resetProgress.mutateAsync({
        bookIds,
        source: 'KOREADER',
      });
      await flushMutationStart();

      const firstRequest = http.expectOne(
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=KOREADER`,
      );
      expect(firstRequest.request.body).toEqual(bookIds.slice(0, 500));
      firstRequest.flush([{bookId: 3}]);
      await flushMutationStart();

      const secondRequest = http.expectOne(
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=KOREADER`,
      );
      expect(secondRequest.request.body).toEqual([501]);
      secondRequest.flush([{bookId: 501}]);

      await expect(resultPromise).resolves.toEqual([
        {bookId: 3, source: 'KOREADER'},
        {bookId: 501, source: 'KOREADER'},
      ]);
    });

    it('reconciles completed reset chunks and reports the failing and unsent IDs', async () => {
      const bookIds = Array.from({length: 1001}, (_, index) => index + 1);
      const firstResults = bookIds.slice(0, 500).map(bookId => ({bookId}));
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
      const resultPromise = host.resetProgress.mutateAsync({
        bookIds,
        source: 'KOBO',
      });
      await flushMutationStart();

      const firstRequest = http.expectOne(
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=KOBO`,
      );
      expect(firstRequest.request.body).toEqual(bookIds.slice(0, 500));
      firstRequest.flush(firstResults);
      await flushMutationStart();

      const secondRequest = http.expectOne(
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=KOBO`,
      );
      expect(secondRequest.request.body).toEqual(bookIds.slice(500, 1000));
      secondRequest.flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

      const error: unknown = await resultPromise.catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(BulkBookCommandPartialError);
      if (!(error instanceof BulkBookCommandPartialError)) {
        throw new Error('Expected a partial bulk command error.');
      }
      expect(error.completed).toEqual(firstResults.map(({bookId}) => ({bookId, source: 'KOBO'})));
      expect(error.failedBookIds).toEqual(bookIds.slice(500));
      expect(error.cause).toBeInstanceOf(HttpErrorResponse);
      expect(invalidateQueries).toHaveBeenCalledTimes(503);
    });

    it('rejects an unsupported source before transport', async () => {
      await expect(host.resetProgress.mutateAsync({
        bookIds: [1],
        source: 'BOOKLORE' as never,
      })).rejects.toThrow('Unsupported reset-progress source: BOOKLORE');

      http.expectNone(() => true);
    });

    it('serializes reset progress behind read-status reconciliation', async () => {
      const reconciliation = deferred<void>();
      vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(reconciliation.promise);
      const statusResult = host.setReadStatus.mutateAsync({bookIds: [1], status: 'READ'});
      const resetResult = host.resetProgress.mutateAsync({bookIds: [1], source: 'GRIMMORY'});
      await flushMutationStart();

      http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`).flush([
        {bookId: 1, readStatus: 'READ'},
      ]);
      await vi.waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalled());
      http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=BOOKLORE`);

      reconciliation.resolve();
      await expect(statusResult).resolves.toEqual([{bookId: 1, readStatus: 'READ'}]);
      await flushMutationStart();
      http.expectOne(
        `${API_CONFIG.BASE_URL}/api/v1/books/reset-progress?type=BOOKLORE`,
      ).flush([{bookId: 1}]);
      await expect(resetResult).resolves.toEqual([{bookId: 1, source: 'GRIMMORY'}]);
    });
  });
});
