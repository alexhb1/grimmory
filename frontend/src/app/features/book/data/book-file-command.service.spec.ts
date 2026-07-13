import {HttpErrorResponse} from '@angular/common/http';
import {HttpTestingController} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {
  injectMutation,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {bookCommandScopes} from './book-command-keys';
import {bookFileCommandKeys, bookFileCommandScopes} from './book-file-command-keys';
import {BookFileCommandService} from './book-file-command.service';
import {bookQueryKeys} from './book-query-keys';

@Injectable()
class BookFileCommandHost {
  private readonly commands = inject(BookFileCommandService);
  readonly combineBooks = injectMutation(() => this.commands.combineBooks());
  readonly organizeFiles = injectMutation(() => this.commands.organizeFiles());
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

describe('BookFileCommandService', () => {
  let host: BookFileCommandHost;
  let service: BookFileCommandService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;

    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        BookFileCommandService,
        BookFileCommandHost,
      ],
    });

    host = TestBed.inject(BookFileCommandHost);
    service = TestBed.inject(BookFileCommandService);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('combines source book files into a target from stable intent and returns removed sources', async () => {
    const resultPromise = host.combineBooks.mutateAsync({
      targetBookId: 30,
      sourceBookIds: [31, 32, 31],
      moveFiles: true,
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/30/attach-file`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      sourceBookIds: [31, 32],
      moveFiles: true,
    });
    request.flush({
      updatedBook: {id: 30},
      deletedSourceBookIds: [31, 32],
    });

    await expect(resultPromise).resolves.toEqual({
      targetBookId: 30,
      removedSourceBookIds: [31, 32],
    });
  });

  it('organizes an explicit deduplicated move plan and acknowledges its books', async () => {
    const resultPromise = host.organizeFiles.mutateAsync({
      moves: [
        {bookId: 41, targetLibraryId: 5, targetLibraryPathId: 51},
        {bookId: 41, targetLibraryId: 5, targetLibraryPathId: 51},
        {bookId: 42, targetLibraryId: 6, targetLibraryPathId: 61},
      ],
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/files/move`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      bookIds: [41, 42],
      moves: [
        {bookId: 41, targetLibraryId: 5, targetLibraryPathId: 51},
        {bookId: 42, targetLibraryId: 6, targetLibraryPathId: 61},
      ],
    });
    request.flush(null);

    await expect(resultPromise).resolves.toEqual({acknowledgedBookIds: [41, 42]});
  });

  it('reconciles the changed target and only the source books confirmed removed by combine', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const removeQueries = vi.spyOn(queryClient, 'removeQueries');
    const resultPromise = host.combineBooks.mutateAsync({
      targetBookId: 30,
      sourceBookIds: [31, 32],
      moveFiles: false,
    });
    await flushMutationStart();

    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/30/attach-file`).flush({
      updatedBook: {id: 30},
      deletedSourceBookIds: [31],
    });
    await resultPromise;

    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(30)});
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
    expect(removeQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(31)});
    expect(removeQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.recommendationQueries(31)});
    expect(removeQueries).not.toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(32)});
  });

  it.each([
    {label: 'invalid target', variables: {targetBookId: 0, sourceBookIds: [2], moveFiles: false}},
    {label: 'empty sources', variables: {targetBookId: 1, sourceBookIds: [], moveFiles: false}},
    {label: 'target repeated as a source', variables: {targetBookId: 1, sourceBookIds: [1], moveFiles: false}},
    {label: 'invalid source', variables: {targetBookId: 1, sourceBookIds: [-2], moveFiles: false}},
    {label: 'invalid move preference', variables: {targetBookId: 1, sourceBookIds: [2], moveFiles: 'yes'}},
  ])('rejects combine $label before transport', async ({variables}) => {
    await expect(host.combineBooks.mutateAsync(variables as never)).rejects.toThrow();
    http.expectNone(() => true);
  });

  it.each([
    {label: 'wrong target', response: {updatedBook: {id: 99}, deletedSourceBookIds: [31]}},
    {label: 'unknown removed source', response: {updatedBook: {id: 30}, deletedSourceBookIds: [99]}},
    {label: 'duplicate removed source', response: {updatedBook: {id: 30}, deletedSourceBookIds: [31, 31]}},
    {label: 'missing removed sources', response: {updatedBook: {id: 30}}},
  ])('rejects combine response with $label before reconciliation', async ({response}) => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.combineBooks.mutateAsync({
      targetBookId: 30,
      sourceBookIds: [31],
      moveFiles: false,
    });
    await flushMutationStart();

    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/30/attach-file`).flush(response);

    await expect(resultPromise).rejects.toThrow();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it.each([
    {label: 'empty plan', moves: []},
    {label: 'invalid book', moves: [{bookId: 0, targetLibraryId: 5, targetLibraryPathId: 51}]},
    {label: 'invalid library', moves: [{bookId: 1, targetLibraryId: -5, targetLibraryPathId: 51}]},
    {label: 'invalid path', moves: [{bookId: 1, targetLibraryId: 5, targetLibraryPathId: 0}]},
    {
      label: 'conflicting destinations',
      moves: [
        {bookId: 1, targetLibraryId: 5, targetLibraryPathId: 51},
        {bookId: 1, targetLibraryId: 6, targetLibraryPathId: 61},
      ],
    },
  ])('rejects organize $label before transport', async ({moves}) => {
    await expect(host.organizeFiles.mutateAsync({moves})).rejects.toThrow();
    http.expectNone(() => true);
  });

  it.each([
    {
      label: 'missing destination library',
      move: {bookId: 1, targetLibraryId: null, targetLibraryPathId: 51},
    },
    {
      label: 'missing destination path',
      move: {bookId: 1, targetLibraryId: 5, targetLibraryPathId: null},
    },
  ])('rejects organize plan with $label before transport', async ({move}) => {
    await expect(host.organizeFiles.mutateAsync({moves: [move] as never})).rejects.toThrow();
    http.expectNone(() => true);
  });

  it('reconciles every acknowledged book and stays pending until reconciliation completes', async () => {
    const reconciliation = deferred<void>();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      .mockReturnValue(reconciliation.promise);
    const resultPromise = host.organizeFiles.mutateAsync({
      moves: [
        {bookId: 41, targetLibraryId: 5, targetLibraryPathId: 51},
        {bookId: 42, targetLibraryId: 6, targetLibraryPathId: 61},
      ],
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/files/move`).flush(null);

    await vi.waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(41)});
      expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(42)});
      expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
    });
    flushSignalAndQueryEffects();
    expect(host.organizeFiles.isPending()).toBe(true);

    reconciliation.resolve();
    await expect(resultPromise).resolves.toEqual({acknowledgedBookIds: [41, 42]});
  });

  it.each(['combine', 'organize'])('propagates %s transport failure without reconciliation', async operation => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = operation === 'combine'
      ? host.combineBooks.mutateAsync({targetBookId: 30, sourceBookIds: [31], moveFiles: false})
      : host.organizeFiles.mutateAsync({
        moves: [{bookId: 41, targetLibraryId: 5, targetLibraryPathId: 51}],
      });
    await flushMutationStart();
    const url = operation === 'combine'
      ? `${API_CONFIG.BASE_URL}/api/v1/books/30/attach-file`
      : `${API_CONFIG.BASE_URL}/api/v1/files/move`;
    http.expectOne(url).flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await expect(resultPromise).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('uses stable hierarchical keys, one shared FIFO scope, and no retries', () => {
    const combineOptions = service.combineBooks();
    const organizeOptions = service.organizeFiles();

    expect(bookFileCommandKeys.all()).toEqual(['books', 'command', 'file']);
    expect(combineOptions.mutationKey).toEqual(bookFileCommandKeys.combineBooks());
    expect(organizeOptions.mutationKey).toEqual(bookFileCommandKeys.organizeFiles());
    expect(combineOptions.scope).toBe(bookFileCommandScopes.files);
    expect(organizeOptions.scope).toBe(bookFileCommandScopes.files);
    expect(bookFileCommandScopes.files).toBe(bookCommandScopes.lifecycle);
    expect(combineOptions.retry).toBe(false);
    expect(organizeOptions.retry).toBe(false);
  });
});
