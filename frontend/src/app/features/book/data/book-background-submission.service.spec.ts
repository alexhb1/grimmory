import {HttpErrorResponse} from '@angular/common/http';
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
import {
  bookBackgroundSubmissionKeys,
  bookBackgroundSubmissionScopes,
} from './book-background-submission-keys';
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

  it.each([
    {
      kind: 'regenerate' as const,
      path: '/bulk-regenerate-covers',
      bookIds: [4, 2, 4],
      normalizedBookIds: [4, 2],
    },
    {
      kind: 'generate' as const,
      path: '/bulk-generate-custom-covers',
      bookIds: [7, 8],
      normalizedBookIds: [7, 8],
    },
  ])('submits $kind with exact JSON and returns the no-content response', async ({
    kind,
    path,
    bookIds,
    normalizedBookIds,
  }) => {
    const resultPromise = host.changeCovers.mutateAsync({kind, bookIds});
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<void>>();
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books${path}`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({bookIds: normalizedBookIds});
    request.flush(null);

    await expect(resultPromise).resolves.toBeUndefined();
  });

  it('rejects invalid book IDs before transport', async () => {
    await expect(host.changeCovers.mutateAsync({
      kind: 'regenerate',
      bookIds: [0],
    })).rejects.toThrow();
    http.expectNone(() => true);
  });

  it('does not invalidate book queries when background work is accepted', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.changeCovers.mutateAsync({kind: 'generate', bookIds: [1]});
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-generate-custom-covers`).flush(null);

    await resultPromise;
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('propagates transport errors without invalidating queries', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.changeCovers.mutateAsync({kind: 'regenerate', bookIds: [4]});
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-regenerate-covers`)
      .flush('Unavailable', {status: 503, statusText: 'Service Unavailable'});

    await expect(resultPromise).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('serializes cover submissions through one FIFO scope', async () => {
    const firstResult = host.changeCovers.mutateAsync({kind: 'regenerate', bookIds: [1]});
    const secondResult = host.changeCovers.mutateAsync({kind: 'generate', bookIds: [2]});
    await flushMutationStart();

    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-generate-custom-covers`);
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-regenerate-covers`).flush(null);
    await firstResult;
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/bulk-generate-custom-covers`).flush(null);
    await secondResult;
  });

  it('uses a stable hierarchical key, shared FIFO scope, and no retries', () => {
    const options = service.changeCovers();
    expect(options.mutationKey).toEqual(bookBackgroundSubmissionKeys.changeCovers());
    expect(options.scope).toBe(bookBackgroundSubmissionScopes.changeCovers);
    expect(options.retry).toBe(false);
  });
});
