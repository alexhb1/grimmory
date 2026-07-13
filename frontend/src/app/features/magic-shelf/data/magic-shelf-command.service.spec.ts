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
import {bookQueryKeys} from '../../book/data/book-query-keys';
import {magicShelfCommandKeys, magicShelfCommandScopes} from './magic-shelf-command-keys';
import {MagicShelfCommandService} from './magic-shelf-command.service';
import {magicShelfQueryKeys} from './magic-shelf-query-keys';

@Injectable()
class MagicShelfCommandHost {
  private readonly commands = inject(MagicShelfCommandService);
  readonly saveShelf = injectMutation(() => this.commands.saveShelf());
  readonly deleteShelf = injectMutation(() => this.commands.deleteShelf());
}

const filter = {
  name: 'All rules',
  type: 'group' as const,
  join: 'and' as const,
  rules: [
    {field: 'readStatus', operator: 'equals', value: 'READING'},
    {
      name: 'Ratings',
      type: 'group' as const,
      join: 'or' as const,
      rules: [
        {field: 'personalRating', operator: 'greater_than', value: 7},
      ],
    },
  ],
};

async function flushMutationStart(): Promise<void> {
  await Promise.resolve();
}

describe('MagicShelfCommandService', () => {
  let host: MagicShelfCommandHost;
  let service: MagicShelfCommandService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        MagicShelfCommandService,
        MagicShelfCommandHost,
      ],
    });
    host = TestBed.inject(MagicShelfCommandHost);
    service = TestBed.inject(MagicShelfCommandService);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('creates a magic shelf from stable filter intent and decodes a clean result', async () => {
    const resultPromise = host.saveShelf.mutateAsync({
      definition: {
        name: '  Currently reading  ',
        icon: {value: 'sparkles', type: 'LUCIDE'},
        visibility: 'private',
        filter,
      },
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/magic-shelves`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Currently reading',
      icon: 'sparkles',
      iconType: 'LUCIDE',
      filterJson: JSON.stringify(filter),
      isPublic: false,
    });
    request.flush({
      id: 41,
      name: 'Currently reading',
      icon: 'sparkles',
      iconType: 'LUCIDE',
      filterJson: JSON.stringify(filter),
      isPublic: false,
    });

    await expect(resultPromise).resolves.toEqual({
      id: 41,
      name: 'Currently reading',
      icon: {value: 'sparkles', type: 'LUCIDE'},
      visibility: 'private',
      filter,
    });
  });

  it('updates a magic shelf with the known ID and keeps backend wire names private', async () => {
    const resultPromise = host.saveShelf.mutateAsync({
      shelfId: 41,
      definition: {
        name: 'Public reading',
        icon: null,
        visibility: 'public',
        filter,
      },
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/magic-shelves`);
    expect(request.request.body).toEqual({
      id: 41,
      name: 'Public reading',
      icon: null,
      iconType: null,
      filterJson: JSON.stringify(filter),
      isPublic: true,
    });
    request.flush({
      id: 41,
      name: 'Public reading',
      icon: null,
      iconType: null,
      filterJson: JSON.stringify(filter),
      isPublic: true,
    });

    await expect(resultPromise).resolves.toEqual({
      id: 41,
      name: 'Public reading',
      icon: null,
      visibility: 'public',
      filter,
    });
  });

  it('refreshes magic definitions and book collections after save', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(magicShelfQueryKeys.all(), ['legacy']);
    queryClient.setQueryData(magicShelfQueryKeys.definitions(), ['clean']);
    const resultPromise = host.saveShelf.mutateAsync({
      definition: {name: 'Shelf', icon: null, visibility: 'private', filter},
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/magic-shelves`).flush({
      id: 1,
      name: 'Shelf',
      filterJson: JSON.stringify(filter),
      isPublic: false,
    });
    await resultPromise;

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: magicShelfQueryKeys.all(),
    });
    expect(queryClient.getQueryState(magicShelfQueryKeys.all())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(magicShelfQueryKeys.definitions())?.isInvalidated).toBe(true);
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
    expect(invalidateQueries).not.toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
  });

  it('deletes a magic shelf and refreshes definitions plus book collections', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.deleteShelf.mutateAsync({shelfId: 41});
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/magic-shelves/41`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    await expect(resultPromise).resolves.toEqual({shelfId: 41});
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: magicShelfQueryKeys.all(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({queryKey: bookQueryKeys.collections()});
  });

  it.each([
    {variables: {definition: {name: '', icon: null, visibility: 'private', filter}}, message: 'Magic shelf name must not be blank.'},
    {variables: {definition: {name: 'x'.repeat(256), icon: null, visibility: 'private', filter}}, message: 'Magic shelf name must not exceed 255 characters.'},
    {variables: {definition: {name: 'Shelf', icon: {value: 'x'.repeat(65), type: 'LUCIDE'}, visibility: 'private', filter}}, message: 'Magic shelf icon must not exceed 64 characters.'},
    {variables: {definition: {name: 'Shelf', icon: null, visibility: 'team', filter}}, message: 'Unsupported shelf visibility: team'},
    {variables: {shelfId: 0, definition: {name: 'Shelf', icon: null, visibility: 'private', filter}}, message: 'Magic shelf ID must be a positive safe integer.'},
    {variables: {definition: {name: 'Shelf', icon: null, visibility: 'private', filter: {...filter, join: 'xor'}}}, message: 'Invalid magic shelf filter.'},
    {variables: {definition: {name: 'Shelf', icon: null, visibility: 'private', filter: {...filter, rules: [{field: 'rating', operator: 'equals', value: Number.NaN}]}}}, message: 'Invalid magic shelf filter.'},
  ])('rejects invalid magic-shelf intent before transport', async ({variables, message}) => {
    await expect(host.saveShelf.mutateAsync(variables as never)).rejects.toThrow(message);
    http.expectNone(() => true);
  });

  it.each([
    {response: null},
    {response: {id: 0, name: 'Shelf', filterJson: JSON.stringify(filter), isPublic: false}},
    {response: {id: 1, name: '', filterJson: JSON.stringify(filter), isPublic: false}},
    {response: {id: 1, name: 'x'.repeat(256), filterJson: JSON.stringify(filter), isPublic: false}},
    {response: {id: 1, name: 'Shelf', filterJson: '{bad', isPublic: false}},
    {response: {id: 1, name: 'Shelf', filterJson: JSON.stringify(filter)}},
  ])('rejects malformed magic-shelf responses before reconciliation', async ({response}) => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.saveShelf.mutateAsync({
      definition: {name: 'Shelf', icon: null, visibility: 'private', filter},
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/magic-shelves`).flush(response);

    await expect(resultPromise).rejects.toThrow('Invalid magic shelf response.');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('rejects an update response for a different magic shelf before reconciliation', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const resultPromise = host.saveShelf.mutateAsync({
      shelfId: 5,
      definition: {name: 'Shelf', icon: null, visibility: 'private', filter},
    });
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/magic-shelves`).flush({
      id: 6,
      name: 'Shelf',
      filterJson: JSON.stringify(filter),
      isPublic: false,
    });

    await expect(resultPromise).rejects.toThrow('Magic shelf response contains unexpected shelf ID 6.');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('uses stable FIFO definition scope and disables retries', () => {
    const save = service.saveShelf();
    const deleteShelf = service.deleteShelf();

    expect(magicShelfCommandKeys.all()).toEqual(['books', 'command', 'magic-shelf']);
    expect(save.mutationKey).toEqual(magicShelfCommandKeys.save());
    expect(deleteShelf.mutationKey).toEqual(magicShelfCommandKeys.delete());
    expect(save.scope).toBe(magicShelfCommandScopes.definitions);
    expect(deleteShelf.scope).toBe(magicShelfCommandScopes.definitions);
    expect(save.retry).toBe(false);
    expect(deleteShelf.retry).toBe(false);
  });
});
