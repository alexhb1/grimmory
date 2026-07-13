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
import {
  bookBackgroundSubmissionKeys,
  bookBackgroundSubmissionScopes,
} from './book-background-submission-keys';
import {
  ChangeCoversResult,
} from './book-background-submission.models';
import {BookBackgroundSubmissionService} from './book-background-submission.service';

@Injectable()
class BookBackgroundSubmissionHost {
  private readonly submissions = inject(BookBackgroundSubmissionService);
  readonly changeCovers = injectMutation(() => this.submissions.changeCovers());
}

async function flushMutationStart(): Promise<void> {
  await Promise.resolve();
}

describe('BookBackgroundSubmissionService', () => {
  let host: BookBackgroundSubmissionHost;
  let service: BookBackgroundSubmissionService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;

    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        BookBackgroundSubmissionService,
        BookBackgroundSubmissionHost,
      ],
    });

    host = TestBed.inject(BookBackgroundSubmissionHost);
    service = TestBed.inject(BookBackgroundSubmissionService);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('uploads one cover for normalized book IDs and returns a submission-only receipt', async () => {
    const file = new File(['cover'], 'cover.jpg', {type: 'image/jpeg'});
    const resultPromise = host.changeCovers.mutateAsync({
      kind: 'upload',
      bookIds: [9, 3, 9, 5],
      file,
    });
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<ChangeCoversResult>>();
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-upload-cover`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    const body = request.request.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('bookIds')).toBe('9,3,5');
    request.flush(null);

    await expect(resultPromise).resolves.toEqual({
      kind: 'upload',
      requestedBookIds: [9, 3, 5],
    });
  });

  it('rejects a bulk-cover upload without a browser File before transport', async () => {
    await expect(host.changeCovers.mutateAsync({
      kind: 'upload',
      bookIds: [9],
      file: {name: 'cover.jpg'} as File,
    })).rejects.toThrow('Bulk cover upload requires a file.');

    http.expectNone(() => true);
  });

  it('submits regeneration with exact JSON and returns only the requested IDs', async () => {
    const resultPromise = host.changeCovers.mutateAsync({
      kind: 'regenerate',
      bookIds: [4, 2, 4],
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-regenerate-covers`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({bookIds: [4, 2]});
    request.flush(null);

    await expect(resultPromise).resolves.toEqual({
      kind: 'regenerate',
      requestedBookIds: [4, 2],
    });
  });

  it('submits custom generation with exact JSON and returns only the requested IDs', async () => {
    const resultPromise = host.changeCovers.mutateAsync({
      kind: 'generate',
      bookIds: [7, 8],
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-generate-custom-covers`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({bookIds: [7, 8]});
    request.flush(null);

    await expect(resultPromise).resolves.toEqual({
      kind: 'generate',
      requestedBookIds: [7, 8],
    });
  });

  it.each([
    {bookIds: [], label: 'empty IDs'},
    {bookIds: [0], label: 'zero ID'},
    {bookIds: [-1], label: 'negative ID'},
    {bookIds: [1.5], label: 'non-integer ID'},
    {bookIds: [Number.MAX_SAFE_INTEGER + 1], label: 'unsafe integer ID'},
  ])('rejects $label before transport', async ({bookIds}) => {
    await expect(host.changeCovers.mutateAsync({
      kind: 'regenerate',
      bookIds,
    })).rejects.toThrow();

    http.expectNone(() => true);
  });

  it('rejects non-array book IDs before transport', async () => {
    await expect(host.changeCovers.mutateAsync({
      kind: 'regenerate',
      bookIds: null as never,
    })).rejects.toThrow('Book IDs must be an array.');

    http.expectNone(() => true);
  });

  it('rejects an unsupported submission kind before transport', async () => {
    await expect(host.changeCovers.mutateAsync({
      kind: 'replace' as never,
      bookIds: [1],
    })).rejects.toThrow('Unsupported cover change kind: replace');

    http.expectNone(() => true);
  });

  it('does not invalidate book queries when background work is accepted', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.changeCovers.mutateAsync({kind: 'generate', bookIds: [1]});
    await flushMutationStart();

    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-generate-custom-covers`).flush(null);

    await expect(resultPromise).resolves.toEqual({kind: 'generate', requestedBookIds: [1]});
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('propagates transport errors without inventing a receipt or invalidating queries', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.changeCovers.mutateAsync({kind: 'regenerate', bookIds: [4]});
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-regenerate-covers`);
    request.flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await expect(resultPromise).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('serializes all bulk-cover submissions through one FIFO scope', async () => {
    const firstResult = host.changeCovers.mutateAsync({kind: 'regenerate', bookIds: [1]});
    const secondResult = host.changeCovers.mutateAsync({kind: 'generate', bookIds: [2]});
    await flushMutationStart();

    const firstRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-regenerate-covers`);
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-generate-custom-covers`);
    firstRequest.flush(null);

    await expect(firstResult).resolves.toEqual({kind: 'regenerate', requestedBookIds: [1]});
    await flushMutationStart();
    const secondRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-generate-custom-covers`);
    secondRequest.flush(null);

    await expect(secondResult).resolves.toEqual({kind: 'generate', requestedBookIds: [2]});
  });

  it('releases the next submission after a transport failure', async () => {
    const firstResult = host.changeCovers.mutateAsync({kind: 'regenerate', bookIds: [1]});
    void firstResult.catch(() => undefined);
    const secondResult = host.changeCovers.mutateAsync({kind: 'generate', bookIds: [2]});
    await flushMutationStart();

    const firstRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-regenerate-covers`);
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-generate-custom-covers`);
    firstRequest.flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await expect(firstResult).rejects.toBeInstanceOf(HttpErrorResponse);
    await flushMutationStart();
    const secondRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-generate-custom-covers`);
    secondRequest.flush(null);

    await expect(secondResult).resolves.toEqual({kind: 'generate', requestedBookIds: [2]});
  });

  it('uses a stable hierarchical key, shared FIFO scope, and no retries', () => {
    const coverOptions = service.changeCovers();

    expect(bookBackgroundSubmissionKeys.all()).toEqual(['books', 'command', 'background-submission']);
    expect(coverOptions.mutationKey).toEqual(bookBackgroundSubmissionKeys.changeCovers());
    expect(coverOptions.scope).toBe(bookBackgroundSubmissionScopes.changeCovers);
    expect(coverOptions.retry).toBe(false);
  });
});
