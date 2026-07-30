import {HttpErrorResponse} from '@angular/common/http';
import {HttpTestingController, TestRequest} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {
  injectMutation,
  MutationFunctionContext,
  Query,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {describe, expect, it, MockInstance, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {
  BulkBookCommandPartialError,
} from '../data/book-command.models';
import {BookCommandService} from '../data/book-command.service';
import {bookQueryKeys} from '../data/book-query-keys';
import {
  legacyBookCachePatches,
  withLegacyBookCache,
} from './book-command-legacy-adapter';
import {Book, ReadStatus} from '../model/book.model';
import {
  BOOKS_QUERY_KEY,
  bookDetailQueryPrefix,
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

function countInvalidationsFor(
  invalidateSpy: MockInstance<QueryClient['invalidateQueries']>,
  queryKey: readonly unknown[],
): number {
  const serializedQueryKey = JSON.stringify(queryKey);
  return invalidateSpy.mock.calls.filter(([filters]) =>
    JSON.stringify(filters?.queryKey) === serializedQueryKey
    || filters?.predicate?.({queryKey} as Query) === true).length;
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
  readonly setReadStatus = injectMutation(() => withLegacyBookCache(
    this.commands.setReadStatus(),
    legacyBookCachePatches.readStatus,
  ));
  readonly deleteBooks = injectMutation(() => withLegacyBookCache(
    this.commands.deleteBooks(),
    legacyBookCachePatches.deleteBooks,
  ));
}

function setupAdapterHost() {
  const harness = createQueryClientHarness();
  TestBed.configureTestingModule({
    providers: [
      ...harness.providers,
      BookCommandService,
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
      bookQueryKeys.recommendations(),
    ];
    for (const queryKey of cleanKeys) {
      const unwrappedCount = countInvalidationsFor(unwrappedInvalidate, queryKey);
      const wrappedCount = countInvalidationsFor(wrappedInvalidate, queryKey);
      expect(wrappedCount).toBe(unwrappedCount);
      expect(wrappedCount).toBe(1);
    }
  });

  it('refetches legacy caches when a dispatched command fails', async () => {
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
    expect(harness.queryClient.getQueryState(BOOKS_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(harness.queryClient.getQueryState([...legacyDetailKey, false])?.isInvalidated).toBe(true);
    expect(harness.queryClient.getQueryState(cleanDetailKey)?.isInvalidated).toBe(true);
    http.verify();
  });

  it('patches confirmed partial deletions and refetches uncertain legacy books', async () => {
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
    expect(harness.queryClient.getQueryState(BOOKS_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(harness.queryClient.getQueryData(legacyKeys.get(1)!)).toBeUndefined();
    expect(harness.queryClient.getQueryData(cleanKeys.get(1)!)).toBeUndefined();
    expect(harness.queryClient.getQueryState(legacyKeys.get(201)!)?.isInvalidated).toBe(true);
    expect(harness.queryClient.getQueryState(cleanKeys.get(201)!)?.isInvalidated).toBe(true);
    expect(harness.queryClient.getQueryState(legacyKeys.get(401)!)?.isInvalidated).toBe(true);
    expect(harness.queryClient.getQueryState(cleanKeys.get(401)!)?.isInvalidated).toBe(false);
    http.verify();
  });
});
