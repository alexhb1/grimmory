import {HttpTestingController} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {QueryClient} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, expectTypeOf, it} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {createQueryClientHarness} from '../../../core/testing/query-testing';
import {retryTransientBookQueryError} from '../../book/data/book-query.service';
import {MagicShelfDefinition} from './magic-shelf-command.models';
import {magicShelfQueryKeys} from './magic-shelf-query-keys';
import {MagicShelfQueryService} from './magic-shelf-query.service';

const filter = {
  name: 'All rules',
  type: 'group' as const,
  join: 'and' as const,
  rules: [{field: 'readStatus', operator: 'equals', value: 'READING'}],
};

describe('MagicShelfQueryService', () => {
  let service: MagicShelfQueryService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    queryClient.setDefaultOptions({queries: {retry: false}});
    TestBed.configureTestingModule({
      providers: [...harness.providers, MagicShelfQueryService],
    });
    service = TestBed.inject(MagicShelfQueryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('uses a collision-free nested key and the shared query policy', () => {
    const options = service.definitions();

    expect(magicShelfQueryKeys.all()).toEqual(['magicShelves']);
    expect(options.queryKey).toEqual(['magicShelves', 'query', 'definitions']);
    expect(options.staleTime).toBe(30_000);
    expect(options.retry).toBe(retryTransientBookQueryError);
  });

  it('decodes definitions while preserving server order', async () => {
    const resultPromise = queryClient.fetchQuery(service.definitions());
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<MagicShelfDefinition[]>>();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/magic-shelves`).flush([
      {
        id: 8,
        name: 'Reading',
        icon: 'sparkles',
        iconType: 'LUCIDE',
        filterJson: JSON.stringify(filter),
        isPublic: true,
        futureField: 'ignored',
      },
      {
        id: 3,
        name: 'Private',
        icon: null,
        iconType: null,
        filterJson: JSON.stringify(filter),
        isPublic: false,
      },
    ]);

    await expect(resultPromise).resolves.toEqual([
      {
        id: 8,
        name: 'Reading',
        icon: {value: 'sparkles', type: 'LUCIDE'},
        visibility: 'public',
        filter,
      },
      {id: 3, name: 'Private', icon: null, visibility: 'private', filter},
    ]);
  });

  it.each([
    null,
    [{id: 0, name: 'Shelf', filterJson: JSON.stringify(filter), isPublic: false}],
    [{id: 1, name: '', filterJson: JSON.stringify(filter), isPublic: false}],
    [{id: 1, name: 'Shelf', filterJson: '{bad', isPublic: false}],
    [{id: 1, name: 'Shelf', filterJson: JSON.stringify(filter)}],
    [{id: 1, name: 'Shelf', iconType: 'LUCIDE', filterJson: JSON.stringify(filter), isPublic: false}],
  ])('rejects malformed wire responses before caching', async response => {
    const resultPromise = queryClient.fetchQuery(service.definitions());
    http.expectOne(`${API_CONFIG.BASE_URL}/api/magic-shelves`).flush(response);

    await expect(resultPromise).rejects.toThrow(/Invalid magic shelf/);
    expect(queryClient.getQueryData(magicShelfQueryKeys.definitions())).toBeUndefined();
  });
});
