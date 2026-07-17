import {HttpErrorResponse} from '@angular/common/http';
import {HttpTestingController, TestRequest} from '@angular/common/http/testing';
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
import {bookQueryKeys} from './book-query-keys';
import {
  BOOK_METADATA_LOCK_FIELDS,
  BookCommandValidationError,
  SetAllBookMetadataLocksResult,
} from './book-command.models';
import {BookCommandService} from './book-command.service';

@Injectable()
class BookMetadataLocksCommandHost {
  private readonly commands = inject(BookCommandService);
  readonly setMetadataFieldLocks = injectMutation(() => this.commands.setMetadataFieldLocks());
  readonly setAllMetadataLocks = injectMutation(() => this.commands.setAllMetadataLocks());
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

  it('sets selected metadata field locks without inventing a backend result', async () => {
    const resultPromise = host.setMetadataFieldLocks.mutateAsync({
      bookIds: [7, 2, 7],
      fieldLocks: {title: true, thumbnail: false, cover: false},
    });
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<void>>();
    const request = await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-field-locks`,
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      bookIds: [7, 2],
      fieldActions: {
        titleLocked: 'LOCK',
        thumbnailLocked: 'UNLOCK',
        coverLocked: 'UNLOCK',
      },
    });
    request.flush(null);

    await expect(resultPromise).resolves.toBeUndefined();
  });

  it('keeps the backend lock aliases on the supported action surface', () => {
    expect(BOOK_METADATA_LOCK_FIELDS).toContain('hardcoverBookId');
    expect(BOOK_METADATA_LOCK_FIELDS).toContain('audiobookCover');
    expect(BOOK_METADATA_LOCK_FIELDS).toContain('thumbnail');
    expect(BOOK_METADATA_LOCK_FIELDS).toHaveLength(43);
  });

  it('rejects empty or unsupported metadata field-lock actions before transport', async () => {
    const detailKey = bookQueryKeys.detail(1, false);
    queryClient.setQueryData(detailKey, {id: 1});
    const emptyError: unknown = await host.setMetadataFieldLocks.mutateAsync({
      bookIds: [1],
      fieldLocks: {},
    }).catch((cause: unknown) => cause);
    expect(emptyError).toBeInstanceOf(BookCommandValidationError);
    expect(emptyError).toHaveProperty('message', 'At least one metadata field lock is required.');
    const unknownError: unknown = await host.setMetadataFieldLocks.mutateAsync({
      bookIds: [1],
      fieldLocks: {unknown: true} as never,
    }).catch((cause: unknown) => cause);
    expect(unknownError).toBeInstanceOf(BookCommandValidationError);
    expect(unknownError).toHaveProperty('message', 'Unsupported metadata lock field: unknown');
    for (const unsupportedField of [
      'doubanId',
      'doubanRating',
      'doubanReviewCount',
      'externalUrl',
    ]) {
      const error: unknown = await host.setMetadataFieldLocks.mutateAsync({
        bookIds: [1],
        fieldLocks: {[unsupportedField]: true} as never,
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(BookCommandValidationError);
      expect(error).toHaveProperty('message', `Unsupported metadata lock field: ${unsupportedField}`);
    }
    const invalidStateError: unknown = await host.setMetadataFieldLocks.mutateAsync({
      bookIds: [1],
      fieldLocks: {title: 'yes'} as never,
    }).catch((cause: unknown) => cause);
    expect(invalidStateError).toBeInstanceOf(BookCommandValidationError);
    expect(invalidStateError).toHaveProperty('message', 'Metadata lock title must be a boolean.');
    http.expectNone(() => true);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(false);
  });

  it('rejects conflicting cover aliases without transport or cache invalidation', async () => {
    const detailKey = bookQueryKeys.detail(1, false);
    queryClient.setQueryData(detailKey, {id: 1});

    const error: unknown = await host.setMetadataFieldLocks.mutateAsync({
      bookIds: [1],
      fieldLocks: {cover: true, thumbnail: false},
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BookCommandValidationError);
    expect(error).toHaveProperty('message', 'Cover and thumbnail locks cannot have conflicting states.');
    http.expectNone(() => true);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(false);
  });

  it('refreshes submitted books after an uncertain field-lock response', async () => {
    const detailKey = bookQueryKeys.detail(1, false);
    queryClient.setQueryData(detailKey, {id: 1});
    const resultPromise = host.setMetadataFieldLocks.mutateAsync({
      bookIds: [1],
      fieldLocks: {title: true},
    });
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-field-locks`,
    ))
      .flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await expect(resultPromise).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it('sets all metadata locks for the requested books confirmed by the backend', async () => {
    const resultPromise = host.setAllMetadataLocks.mutateAsync({bookIds: [9, 4, 9], locked: true});
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<readonly SetAllBookMetadataLocksResult[]>>();
    const request = await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-all-lock`,
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({bookIds: [9, 4], lock: 'LOCK'});
    request.flush([{
      bookId: 4,
      allMetadataLocked: true,
      titleLocked: true,
      doubanIdLocked: false,
      externalUrlLocked: false,
    }]);

    await expect(resultPromise).resolves.toEqual([
      {
        bookId: 4,
        locked: true,
        metadataLocks: {
          allMetadataLocked: true,
          titleLocked: true,
          doubanIdLocked: false,
          externalUrlLocked: false,
        },
      },
    ]);
  });

  it.each([
    {
      response: [
        {bookId: 9, allMetadataLocked: false},
        {bookId: 9, allMetadataLocked: false},
      ],
      label: 'duplicate book',
    },
    {
      response: [
        {bookId: 9, allMetadataLocked: false},
        {bookId: 5, allMetadataLocked: false},
      ],
      label: 'unexpected book',
    },
    {
      response: [{bookId: 9, allMetadataLocked: true}],
      label: 'state that disagrees with the command',
    },
    {response: null, label: 'non-array response'},
  ])('rejects all-lock response with $label', async ({response}) => {
    const resultPromise = host.setAllMetadataLocks.mutateAsync({bookIds: [9, 4], locked: false});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-all-lock`,
    )).flush(response);

    await expect(resultPromise).rejects.toThrow('Invalid metadata all-lock response.');
  });

  it('refreshes submitted books after a malformed all-lock response', async () => {
    const detailKey = bookQueryKeys.detail(9, false);
    queryClient.setQueryData(detailKey, {id: 9});
    const resultPromise = host.setAllMetadataLocks.mutateAsync({bookIds: [9], locked: false});
    (await expectOneEventually(
      http,
      `${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-all-lock`,
    )).flush(null);

    await expect(resultPromise).rejects.toThrow('Invalid metadata all-lock response.');
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it('exposes stable command keys, FIFO scopes, and disabled retries', () => {
    const fieldLocks = service.setMetadataFieldLocks();
    const allLocks = service.setAllMetadataLocks();

    expect(fieldLocks.mutationKey).toEqual(bookCommandKeys.metadataFieldLocks());
    expect(fieldLocks.scope).toBe(bookCommandScopes.metadata);
    expect(allLocks.scope).toBe(bookCommandScopes.metadata);
    expect([fieldLocks, allLocks].every(options => options.retry === false)).toBe(true);
  });
});
