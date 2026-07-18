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
import {AUTHORS_QUERY_KEY} from '../../author-browser/service/author-query-keys';
import {bookCommandScopes} from '../../book/data/book-command-keys';
import {bookQueryKeys} from '../../book/data/book-query-keys';
import {
  metadataRefreshCommandKeys,
  metadataRefreshCommandScopes,
} from './metadata-refresh-command-keys';
import {RefreshMetadataResult} from './metadata-refresh-command.models';
import {MetadataRefreshCommandService} from './metadata-refresh-command.service';

@Injectable()
class Host {
  private readonly commands = inject(MetadataRefreshCommandService);
  readonly refresh = injectMutation(() => this.commands.refreshMetadata());
}

function accepted(taskId = 'metadata-task-1') {
  return {
    taskId,
    taskType: 'REFRESH_METADATA_MANUAL',
    status: 'ACCEPTED',
  };
}

describe('MetadataRefreshCommandService', () => {
  let host: Host;
  let service: MetadataRefreshCommandService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    TestBed.configureTestingModule({
      providers: [...harness.providers, MetadataRefreshCommandService, Host],
    });
    host = TestBed.inject(Host);
    service = TestBed.inject(MetadataRefreshCommandService);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it.each([
    {
      target: {kind: 'books' as const, bookIds: [9, 3, 9]},
      options: {refreshType: 'BOOKS', bookIds: [9, 3]},
    },
    {
      target: {kind: 'library' as const, libraryId: 4},
      options: {refreshType: 'LIBRARY', libraryId: 4},
    },
  ])('submits $target.kind with server-owned defaults without treating acceptance as completion', async ({
    target,
    options,
  }) => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.refresh.mutateAsync({target});
    expectTypeOf(result).toEqualTypeOf<Promise<RefreshMetadataResult>>();
    await Promise.resolve();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/tasks/start`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      taskType: 'REFRESH_METADATA_MANUAL',
      triggeredByCron: false,
      options,
    });
    request.flush(accepted());

    await expect(result).resolves.toEqual({taskId: 'metadata-task-1'});
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each([
    {variables: {target: {kind: 'books', bookIds: []}}, message: 'At least one book ID is required.'},
    {variables: {target: {kind: 'books', bookIds: [0]}}, message: 'Book ID must be a positive integer.'},
    {variables: {target: {kind: 'library', libraryId: 0}}, message: 'Library ID must be a positive safe integer.'},
    {variables: {target: {kind: 'series', seriesId: 1}}, message: 'Unsupported metadata refresh target: series.'},
  ])('rejects invalid target before transport', async ({variables, message}) => {
    await expect(host.refresh.mutateAsync(variables as never)).rejects.toThrow(message);
    http.expectNone(() => true);
  });

  it.each([
    {response: null},
    {response: {...accepted(), taskId: ' '}},
    {response: {...accepted(), taskType: 'UPDATE_BOOK_RECOMMENDATIONS'}},
    {response: {...accepted(), status: 'COMPLETED'}},
  ])('rejects an invalid task-acceptance response before reconciliation', async ({response}) => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.refresh.mutateAsync({target: {kind: 'books', bookIds: [1]}});
    await Promise.resolve();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/tasks/start`).flush(response);

    await expect(result).rejects.toThrow('Invalid metadata refresh response.');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('reconciles book and author queries for any valid completed metadata batch', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    service.handleBatchProgress({taskId: 'metadata-task-1', status: 'COMPLETED'});

    expect(invalidate).toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
    expect(invalidate).toHaveBeenCalledWith({queryKey: AUTHORS_QUERY_KEY, exact: true});
  });

  it.each([
    null,
    {taskId: 'task-1', status: 'IN_PROGRESS'},
    {taskId: 'task-1', status: 'ERROR'},
  ])('ignores unrelated or incomplete batch progress %#', payload => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    service.handleBatchProgress(payload);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('uses reusable stable options with one FIFO scope and no retries', () => {
    const options = service.refreshMetadata();
    expect(options.mutationKey).toEqual(metadataRefreshCommandKeys.refresh());
    expect(options.scope).toBe(metadataRefreshCommandScopes.refresh);
    expect(options.scope).toBe(bookCommandScopes.metadata);
    expect(options.retry).toBe(false);
  });
});
