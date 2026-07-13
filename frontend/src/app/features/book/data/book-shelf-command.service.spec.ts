import {HttpTestingController} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {injectMutation, QueryClient} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {bookQueryKeys} from './book-query-keys';
import {bookShelfCommandKeys, bookShelfCommandScopes} from './book-shelf-command-keys';
import {BookShelfCommandService} from './book-shelf-command.service';
import {shelfDefinitionQueryKeys} from './shelf-definition-query-keys';

@Injectable()
class BookShelfCommandHost {
  private readonly commands = inject(BookShelfCommandService);
  readonly updateMembership = injectMutation(() => this.commands.updateMembership());
  readonly createShelf = injectMutation(() => this.commands.createShelf());
  readonly updateShelf = injectMutation(() => this.commands.updateShelf());
  readonly deleteShelf = injectMutation(() => this.commands.deleteShelf());
}

async function flushMutationStart(): Promise<void> {
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
}

describe('BookShelfCommandService', () => {
  let host: BookShelfCommandHost;
  let service: BookShelfCommandService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        BookShelfCommandService,
        BookShelfCommandHost,
      ],
    });
    host = TestBed.inject(BookShelfCommandHost);
    service = TestBed.inject(BookShelfCommandService);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('posts normalized membership changes and returns only server-confirmed book IDs', async () => {
    const resultPromise = host.updateMembership.mutateAsync({
      bookIds: [8, 3, 8, 5],
      assignShelfIds: [11, 9, 11],
      unassignShelfIds: [7, 7],
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      bookIds: [8, 3, 5],
      shelvesToAssign: [11, 9],
      shelvesToUnassign: [7],
    });
    request.flush([{id: 8}, {id: 5}]);

    await expect(resultPromise).resolves.toEqual({
      confirmedBookIds: [8, 5],
      assignedShelfIds: [11, 9],
      unassignedShelfIds: [7],
    });
  });

  it('accepts an empty confirmed result when none of the requested book IDs exists', async () => {
    const resultPromise = host.updateMembership.mutateAsync({
      bookIds: [99],
      assignShelfIds: [4],
      unassignShelfIds: [],
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`).flush([]);

    await expect(resultPromise).resolves.toEqual({
      confirmedBookIds: [],
      assignedShelfIds: [4],
      unassignedShelfIds: [],
    });
  });

  it.each([
    {bookIds: [], assignShelfIds: [1], unassignShelfIds: [], message: 'At least one book ID is required.'},
    {bookIds: [0], assignShelfIds: [1], unassignShelfIds: [], message: 'Book IDs must be positive integers.'},
    {bookIds: [1], assignShelfIds: [], unassignShelfIds: [], message: 'At least one shelf change is required.'},
    {bookIds: [1], assignShelfIds: [0], unassignShelfIds: [], message: 'Shelf IDs must be positive integers.'},
    {bookIds: [1], assignShelfIds: [2], unassignShelfIds: [2], message: 'A shelf cannot be assigned and unassigned together.'},
  ])('rejects invalid variables before transport', async variables => {
    await expect(host.updateMembership.mutateAsync(variables)).rejects.toThrow(variables.message);
    http.expectNone(() => true);
  });

  it.each([
    {response: null, message: 'Invalid shelf membership response.'},
    {response: [{id: 1}, {id: 1}], message: 'Shelf membership response contains duplicate book ID 1.'},
    {response: [{id: 2}], message: 'Shelf membership response contains unexpected book ID 2.'},
    {response: [{id: 0}], message: 'Invalid shelf membership response.'},
  ])('rejects an invalid or uncorrelated response before cache reconciliation', async ({response, message}) => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.updateMembership.mutateAsync({
      bookIds: [1],
      assignShelfIds: [4],
      unassignShelfIds: [],
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`).flush(response);

    await expect(resultPromise).rejects.toThrow(message);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('awaits bounded clean book-query reconciliation for confirmed books', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.updateMembership.mutateAsync({
      bookIds: [1, 2],
      assignShelfIds: [4],
      unassignShelfIds: [],
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`).flush([{id: 2}]);
    await resultPromise;

    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(2)});
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: shelfDefinitionQueryKeys.all(),
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(1)});
  });

  it('starts book and shelf-count reconciliation together and awaits both', async () => {
    const reconciliation = deferred<void>();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      .mockReturnValue(reconciliation.promise);
    const resultPromise = host.updateMembership.mutateAsync({
      bookIds: [2],
      assignShelfIds: [4],
      unassignShelfIds: [],
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`).flush([{id: 2}]);

    await vi.waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: shelfDefinitionQueryKeys.all(),
      });
      expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
    });

    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    reconciliation.resolve();
    await expect(resultPromise).resolves.toEqual({
      confirmedBookIds: [2],
      assignedShelfIds: [4],
      unassignedShelfIds: [],
    });
  });

  it('creates a regular shelf from stable definition intent and decodes a clean result', async () => {
    const resultPromise = host.createShelf.mutateAsync({
      definition: {
        name: '  Favourites  ',
        icon: {value: 'heart', type: 'LUCIDE'},
        visibility: 'private',
      },
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/shelves`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Favourites',
      icon: 'heart',
      iconType: 'LUCIDE',
      publicShelf: false,
    });
    request.flush({
      id: 12,
      name: 'Favourites',
      icon: 'heart',
      iconType: 'LUCIDE',
      publicShelf: false,
      bookCount: 0,
    });

    await expect(resultPromise).resolves.toEqual({
      id: 12,
      name: 'Favourites',
      icon: {value: 'heart', type: 'LUCIDE'},
      visibility: 'private',
    });
  });

  it('updates a regular shelf and broadly reconciles books with embedded shelf data', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.updateShelf.mutateAsync({
      shelfId: 12,
      definition: {
        name: 'Shared shelf',
        icon: null,
        visibility: 'public',
      },
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/shelves/12`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      name: 'Shared shelf',
      icon: null,
      iconType: null,
      publicShelf: true,
    });
    request.flush({id: 12, name: 'Shared shelf', publicShelf: true, bookCount: 4});
    await expect(resultPromise).resolves.toEqual({
      id: 12,
      name: 'Shared shelf',
      icon: null,
      visibility: 'public',
    });

    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: shelfDefinitionQueryKeys.all(),
    });
  });

  it('deletes a regular shelf and broadly reconciles unknown affected members', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.deleteShelf.mutateAsync({shelfId: 12});
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/shelves/12`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    await expect(resultPromise).resolves.toEqual({shelfId: 12});
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: shelfDefinitionQueryKeys.all(),
    });
  });

  it('refreshes only regular shelf definitions after creation', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(shelfDefinitionQueryKeys.all(), ['legacy']);
    queryClient.setQueryData(shelfDefinitionQueryKeys.definitions(), ['clean']);
    const resultPromise = host.createShelf.mutateAsync({
      definition: {name: 'New', icon: null, visibility: 'private'},
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/shelves`)
      .flush({id: 13, name: 'New', publicShelf: false, bookCount: 0});
    await resultPromise;

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: shelfDefinitionQueryKeys.all(),
    });
    expect(queryClient.getQueryState(shelfDefinitionQueryKeys.all())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(shelfDefinitionQueryKeys.definitions())?.isInvalidated).toBe(true);
  });

  it.each([
    {definition: {name: '   ', icon: null, visibility: 'private'}, message: 'Shelf name must not be blank.'},
    {definition: {name: 'Shelf', icon: {value: '', type: 'LUCIDE'}, visibility: 'private'}, message: 'Shelf icon value must not be blank.'},
    {definition: {name: 'Shelf', icon: {value: 'x', type: 'OTHER'}, visibility: 'private'}, message: 'Unsupported shelf icon type: OTHER'},
    {definition: {name: 'Shelf', icon: null, visibility: 'friends'}, message: 'Unsupported shelf visibility: friends'},
  ])('rejects invalid shelf definition intent before transport', async ({definition, message}) => {
    await expect(host.createShelf.mutateAsync({definition: definition as never})).rejects.toThrow(message);
    http.expectNone(() => true);
  });

  it.each([
    {response: null, message: 'Invalid shelf definition response.'},
    {response: {id: 0, name: 'Shelf', publicShelf: false}, message: 'Invalid shelf definition response.'},
    {response: {id: 3, name: '', publicShelf: false}, message: 'Invalid shelf definition response.'},
    {response: {id: 3, name: 'Shelf'}, message: 'Invalid shelf definition response.'},
    {response: {id: 3, name: 'Shelf', publicShelf: false, icon: 'x', iconType: 'OTHER'}, message: 'Invalid shelf definition response.'},
  ])('rejects malformed shelf definition responses before reconciliation', async ({response, message}) => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.createShelf.mutateAsync({
      definition: {name: 'Shelf', icon: null, visibility: 'private'},
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/shelves`).flush(response);

    await expect(resultPromise).rejects.toThrow(message);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('rejects an update response for a different shelf before reconciliation', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.updateShelf.mutateAsync({
      shelfId: 3,
      definition: {name: 'Shelf', icon: null, visibility: 'private'},
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/shelves/3`)
      .flush({id: 4, name: 'Shelf', publicShelf: false});

    await expect(resultPromise).rejects.toThrow('Shelf update response contains unexpected shelf ID 4.');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('uses one stable FIFO scope and no retries', () => {
    const options = service.updateMembership();

    expect(bookShelfCommandKeys.all()).toEqual(['books', 'command', 'shelf']);
    expect(options.mutationKey).toEqual(bookShelfCommandKeys.updateMembership());
    expect(options.scope).toBe(bookShelfCommandScopes.regularShelves);
    expect(options.retry).toBe(false);
    expect(service.createShelf().mutationKey).toEqual(bookShelfCommandKeys.create());
    expect(service.updateShelf().mutationKey).toEqual(bookShelfCommandKeys.update());
    expect(service.deleteShelf().mutationKey).toEqual(bookShelfCommandKeys.delete());
    expect(service.createShelf().scope).toBe(bookShelfCommandScopes.regularShelves);
    expect(service.updateShelf().scope).toBe(bookShelfCommandScopes.regularShelves);
    expect(service.deleteShelf().scope).toBe(bookShelfCommandScopes.regularShelves);
    expect(service.createShelf().retry).toBe(false);
    expect(service.updateShelf().retry).toBe(false);
    expect(service.deleteShelf().retry).toBe(false);
  });

  it('does not let a shelf deletion overtake an in-flight membership change', async () => {
    const membershipResult = host.updateMembership.mutateAsync({
      bookIds: [8],
      assignShelfIds: [11],
      unassignShelfIds: [],
    });
    const deleteResult = host.deleteShelf.mutateAsync({shelfId: 11});
    await flushMutationStart();

    const membershipRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`);
    http.expectNone(`${API_CONFIG.BASE_URL}/api/v1/shelves/11`);
    membershipRequest.flush([{id: 8}]);

    await expect(membershipResult).resolves.toEqual({
      confirmedBookIds: [8],
      assignedShelfIds: [11],
      unassignedShelfIds: [],
    });
    await flushMutationStart();

    const deleteRequest = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/shelves/11`);
    deleteRequest.flush(null);
    await expect(deleteResult).resolves.toEqual({shelfId: 11});
  });
});
