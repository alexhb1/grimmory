import {HttpTestingController} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {injectMutation, QueryClient} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {createQueryClientHarness, flushSignalAndQueryEffects} from '../../../core/testing/query-testing';
import {bookQueryKeys} from '../../book/data/book-query-keys';
import {libraryCommandKeys, libraryCommandScopes} from './library-command-keys';
import {libraryQueryKeys} from './library-query-keys';
import {LibraryCommandService} from './library-command.service';

@Injectable()
class Host {
  private readonly commands = inject(LibraryCommandService);
  readonly create = injectMutation(() => this.commands.createLibrary());
  readonly update = injectMutation(() => this.commands.updateLibrary());
  readonly delete = injectMutation(() => this.commands.deleteLibrary());
  readonly refresh = injectMutation(() => this.commands.refreshLibrary());
}

const update = {
  name: '  Main Library  ',
  icon: {value: 'books', type: 'LUCIDE' as const},
  watch: true,
  paths: ['/books', ' /audio ', '/books'],
  formatPriority: ['EPUB', 'PDF'] as const,
  allowedFormats: ['EPUB', 'PDF', 'AUDIOBOOK'] as const,
  metadataSource: 'prefer-sidecar' as const,
  organizationMode: 'auto-detect' as const,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
}

describe('LibraryCommandService', () => {
  let host: Host;
  let service: LibraryCommandService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    TestBed.configureTestingModule({providers: [...harness.providers, LibraryCommandService, Host]});
    host = TestBed.inject(Host);
    service = TestBed.inject(LibraryCommandService);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('creates a library from clean configuration intent and returns its identity', async () => {
    const result = host.create.mutateAsync({definition: update});
    await Promise.resolve();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/libraries`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Main Library',
      icon: 'books',
      iconType: 'LUCIDE',
      watch: true,
      paths: [{path: '/books'}, {path: '/audio'}],
      formatPriority: ['EPUB', 'PDF'],
      allowedFormats: ['EPUB', 'PDF', 'AUDIOBOOK'],
      metadataSource: 'PREFER_SIDECAR',
      organizationMode: 'AUTO_DETECT',
    });
    request.flush({id: 12, name: 'Main Library'});
    await expect(result).resolves.toEqual({libraryId: 12, name: 'Main Library'});
  });

  it('refreshes library definitions after creation without treating its background scan as complete', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.create.mutateAsync({definition: update});
    await Promise.resolve();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/libraries`).flush({
      id: 12,
      name: 'Main Library',
    });
    await result;
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: libraryQueryKeys.definitions(),
      exact: true,
    });
    expect(invalidate).not.toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
  });

  it('keeps creation pending until the library definitions refresh completes', async () => {
    const reconciliation = deferred<void>();
    vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(reconciliation.promise);
    const result = host.create.mutateAsync({definition: update});
    await Promise.resolve();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/libraries`).flush({
      id: 12,
      name: 'Main Library',
    });

    await vi.waitFor(() => expect(host.create.isPending()).toBe(true));
    reconciliation.resolve();

    await expect(result).resolves.toEqual({libraryId: 12, name: 'Main Library'});
  });

  it('rejects an uncorrelated creation response before reconciliation', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.create.mutateAsync({definition: update});
    await Promise.resolve();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/libraries`).flush({
      id: 12,
      name: 'Other Library',
    });

    await expect(result).rejects.toThrow(
      'Library response contains unexpected library name Other Library.',
    );
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('updates a library from clean configuration intent and decodes its identity', async () => {
    const result = host.update.mutateAsync({libraryId: 7, definition: update});
    await Promise.resolve();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/libraries/7`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      name: 'Main Library',
      icon: 'books',
      iconType: 'LUCIDE',
      watch: true,
      paths: [{path: '/books'}, {path: '/audio'}],
      formatPriority: ['EPUB', 'PDF'],
      allowedFormats: ['EPUB', 'PDF', 'AUDIOBOOK'],
      metadataSource: 'PREFER_SIDECAR',
      organizationMode: 'AUTO_DETECT',
    });
    request.flush({id: 7, name: 'Main Library'});
    await expect(result).resolves.toEqual({libraryId: 7, name: 'Main Library'});
  });

  it('invalidates library definitions and all clean book queries after update', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.update.mutateAsync({libraryId: 7, definition: update});
    await Promise.resolve();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/libraries/7`).flush({id: 7, name: 'Main Library'});
    await result;
    expect(invalidate).toHaveBeenCalledWith({queryKey: libraryQueryKeys.definitions(), exact: true});
    expect(invalidate).toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
  });

  it('deletes a library, removes its counts and invalidates definitions plus books', async () => {
    const remove = vi.spyOn(queryClient, 'removeQueries');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.delete.mutateAsync({libraryId: 7});
    await Promise.resolve();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/libraries/7`).flush(null);
    await expect(result).resolves.toEqual({libraryId: 7});
    expect(remove).toHaveBeenCalledWith({queryKey: libraryQueryKeys.formatCounts(7), exact: true});
    expect(invalidate).toHaveBeenCalledWith({queryKey: libraryQueryKeys.definitions(), exact: true});
    expect(invalidate).toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
  });

  it('requests a library refresh and invalidates definitions without claiming scan completion', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.refresh.mutateAsync({libraryId: 7});
    await Promise.resolve();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/libraries/7/refresh`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({});
    request.flush(null);
    await expect(result).resolves.toEqual({libraryId: 7});
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: libraryQueryKeys.definitions(),
      exact: true,
    });
    expect(invalidate).not.toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
  });

  it('rejects invalid library refresh intent before transport', async () => {
    await expect(host.refresh.mutateAsync({libraryId: 0})).rejects.toThrow(
      'Library ID must be a positive safe integer.',
    );
    http.expectNone(() => true);
  });

  it.each([
    {variables: {libraryId: 0, definition: update}, message: 'Library ID must be a positive safe integer.'},
    {variables: {libraryId: 7, definition: {...update, name: ' '}}, message: 'Library name must not be blank.'},
    {variables: {libraryId: 7, definition: {...update, paths: []}}, message: 'At least one library path is required.'},
    {variables: {libraryId: 7, definition: {...update, allowedFormats: ['TXT']}}, message: 'Unsupported library book format: TXT'},
  ])('rejects invalid update intent before transport', async ({variables, message}) => {
    await expect(host.update.mutateAsync(variables as never)).rejects.toThrow(message);
    http.expectNone(() => true);
  });

  it('rejects an uncorrelated update response before reconciliation', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.update.mutateAsync({libraryId: 7, definition: update});
    await Promise.resolve();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/libraries/7`).flush({id: 8, name: 'Other'});
    await expect(result).rejects.toThrow('Library response contains unexpected library ID 8.');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('uses reusable stable keys, one FIFO library scope and no retries', () => {
    const createOptions = service.createLibrary();
    const updateOptions = service.updateLibrary();
    const deleteOptions = service.deleteLibrary();
    const refreshOptions = service.refreshLibrary();
    expect(createOptions.mutationKey).toEqual(libraryCommandKeys.create());
    expect(updateOptions.mutationKey).toEqual(libraryCommandKeys.update());
    expect(deleteOptions.mutationKey).toEqual(libraryCommandKeys.delete());
    expect(refreshOptions.mutationKey).toEqual(libraryCommandKeys.refresh());
    expect(createOptions.scope).toBe(libraryCommandScopes.libraries);
    expect(updateOptions.scope).toBe(libraryCommandScopes.libraries);
    expect(deleteOptions.scope).toBe(libraryCommandScopes.libraries);
    expect(refreshOptions.scope).toBe(libraryCommandScopes.libraries);
    expect(createOptions.retry).toBe(false);
    expect(updateOptions.retry).toBe(false);
    expect(deleteOptions.retry).toBe(false);
    expect(refreshOptions.retry).toBe(false);
  });
});
