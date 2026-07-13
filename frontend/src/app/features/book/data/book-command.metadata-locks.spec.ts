import {HttpTestingController} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {injectMutation, QueryClient} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {bookCommandKeys, bookCommandScopes} from './book-command-keys';
import {
  SetBookMetadataFieldLocksResult,
  SetAllBookMetadataLocksResult,
} from './book-command.models';
import {BookCommandService} from './book-command.service';

@Injectable()
class BookMetadataLocksCommandHost {
  private readonly commands = inject(BookCommandService);
  readonly setMetadataFieldLocks = injectMutation(() => this.commands.setMetadataFieldLocks());
  readonly setAllMetadataLocks = injectMutation(() => this.commands.setAllMetadataLocks());
}

async function flushMutationStart(): Promise<void> {
  await Promise.resolve();
}

describe('BookCommandService metadata lock commands', () => {
  let host: BookMetadataLocksCommandHost;
  let service: BookCommandService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    TestBed.configureTestingModule({
      providers: [...harness.providers, BookCommandService, BookMetadataLocksCommandHost],
    });
    host = TestBed.inject(BookMetadataLocksCommandHost);
    service = TestBed.inject(BookCommandService);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('sets selected metadata field locks and returns normalized submitted intent', async () => {
    const resultPromise = host.setMetadataFieldLocks.mutateAsync({
      bookIds: [7, 2, 7],
      fieldLocks: {title: true, thumbnail: false},
    });
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<SetBookMetadataFieldLocksResult>>();
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-field-locks`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      bookIds: [7, 2],
      fieldActions: {titleLocked: 'LOCK', thumbnailLocked: 'UNLOCK'},
    });
    request.flush(null);

    await expect(resultPromise).resolves.toEqual({
      bookIds: [7, 2],
      fieldLocks: {title: true, thumbnail: false},
    });
  });

  it('rejects empty or unsupported metadata field-lock actions before transport', async () => {
    await expect(host.setMetadataFieldLocks.mutateAsync({
      bookIds: [1],
      fieldLocks: {},
    })).rejects.toThrow('At least one metadata field lock is required.');
    await expect(host.setMetadataFieldLocks.mutateAsync({
      bookIds: [1],
      fieldLocks: {unknown: true} as never,
    })).rejects.toThrow('Unsupported metadata lock field: unknown');
    await expect(host.setMetadataFieldLocks.mutateAsync({
      bookIds: [1],
      fieldLocks: {title: 'yes'} as never,
    })).rejects.toThrow('Metadata lock title must be a boolean.');
    http.expectNone(() => true);
  });

  it('sets all metadata locks only when every requested book is acknowledged', async () => {
    const resultPromise = host.setAllMetadataLocks.mutateAsync({bookIds: [9, 4, 9], locked: true});
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<readonly SetAllBookMetadataLocksResult[]>>();
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-all-lock`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({bookIds: [9, 4], lock: 'LOCK'});
    request.flush([{bookId: 4}, {bookId: 9}]);

    await expect(resultPromise).resolves.toEqual([
      {bookId: 4, locked: true},
      {bookId: 9, locked: true},
    ]);
  });

  it.each([
    {response: [{bookId: 9}], label: 'missing book'},
    {response: [{bookId: 9}, {bookId: 9}], label: 'duplicate book'},
    {response: [{bookId: 9}, {bookId: 5}], label: 'unexpected book'},
    {response: null, label: 'non-array response'},
  ])('rejects all-lock response with $label before reconciliation', async ({response}) => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.setAllMetadataLocks.mutateAsync({bookIds: [9, 4], locked: false});
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-all-lock`).flush(response);

    await expect(resultPromise).rejects.toThrow('Invalid metadata all-lock response.');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('exposes stable command keys, FIFO scopes, and disabled retries', () => {
    const fieldLocks = service.setMetadataFieldLocks();
    const allLocks = service.setAllMetadataLocks();

    expect(fieldLocks.mutationKey).toEqual(bookCommandKeys.metadataFieldLocks());
    expect(fieldLocks.scope).toBe(bookCommandScopes.metadata);
    expect(allLocks.mutationKey).toEqual(bookCommandKeys.metadataAllLocks());
    expect(allLocks.scope).toBe(bookCommandScopes.metadata);
    expect([fieldLocks, allLocks].every(options => options.retry === false)).toBe(true);
  });
});
