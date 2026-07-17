import {HttpTestingController} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {QueryClient} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, expectTypeOf, it} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createAuthServiceStub,
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {AuthService} from '../../../shared/service/auth.service';
import {retryTransientBookQueryError} from './book-query-transport';
import {ShelfDefinition} from './shelf-definition.models';
import {shelfDefinitionQueryKeys} from './shelf-definition-query-keys';
import {ShelfDefinitionQueryService} from './shelf-definition-query.service';

describe('ShelfDefinitionQueryService', () => {
  let service: ShelfDefinitionQueryService;
  let queryClient: QueryClient;
  let authService: ReturnType<typeof createAuthServiceStub>;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    authService = createAuthServiceStub();
    queryClient.setDefaultOptions({queries: {retry: false}});
    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        {provide: AuthService, useValue: authService},
        ShelfDefinitionQueryService,
      ],
    });
    service = TestBed.inject(ShelfDefinitionQueryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('uses a collision-free nested key and the shared query policy', () => {
    const options = service.definitions();

    expect(shelfDefinitionQueryKeys.all()).toEqual(['shelves', 'query']);
    expect(options.queryKey).toEqual(['shelves', 'query', 'definitions']);
    expect(options.retry).toBe(retryTransientBookQueryError);
  });

  it('removes its cached shelf queries when the authenticated session ends', () => {
    queryClient.setQueryData(shelfDefinitionQueryKeys.definitions(), [{id: 7}]);

    authService.token.set(null);
    flushSignalAndQueryEffects();

    expect(queryClient.getQueryData(shelfDefinitionQueryKeys.definitions())).toBeUndefined();
  });

  it('decodes definitions with counts while preserving server order', async () => {
    const resultPromise = queryClient.fetchQuery(service.definitions());
    expectTypeOf(resultPromise).toEqualTypeOf<Promise<ShelfDefinition[]>>();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/shelves`).flush([
      {
        id: 9,
        name: 'Later',
        icon: 'heart',
        iconType: 'CUSTOM_SVG',
        publicShelf: true,
        bookCount: 4,
        userId: 3,
      },
      {id: 2, userId: 7, name: 'Earlier', icon: 'legacy-icon', publicShelf: false, bookCount: 0},
    ]);

    await expect(resultPromise).resolves.toEqual([
      {
        id: 9,
        userId: 3,
        name: 'Later',
        icon: {value: 'heart', type: 'CUSTOM_SVG'},
        visibility: 'public',
        bookCount: 4,
      },
      {
        id: 2,
        userId: 7,
        name: 'Earlier',
        icon: {value: 'legacy-icon', type: null},
        visibility: 'private',
        bookCount: 0,
      },
    ]);
  });

  it.each([
    null,
    [{id: 0, userId: 7, name: 'Shelf', publicShelf: false, bookCount: 0}],
    [{id: 1, userId: 7, name: '', publicShelf: false, bookCount: 0}],
    [{id: 1, userId: 7, name: 'Shelf', publicShelf: 'false', bookCount: 0}],
    [{id: 1, userId: 7, name: 'Shelf', publicShelf: false}],
    [{id: 1, userId: 7, name: 'Shelf', publicShelf: false, bookCount: -1}],
    [{id: 1, userId: 7, name: 'Shelf', iconType: 'LUCIDE', publicShelf: false, bookCount: 0}],
    [{id: 1, userId: 0, name: 'Shelf', publicShelf: false, bookCount: 0}],
  ])('rejects malformed wire responses before caching', async response => {
    const resultPromise = queryClient.fetchQuery(service.definitions());
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/shelves`).flush(response);

    await expect(resultPromise).rejects.toThrow(/Invalid shelf/);
    expect(queryClient.getQueryData(shelfDefinitionQueryKeys.definitions())).toBeUndefined();
  });
});
