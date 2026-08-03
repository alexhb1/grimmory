import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';

import {
  createAuthServiceStub,
  createQueryClientHarness,
} from '../../../core/testing/query-testing';
import {AuthService} from '../../../shared/service/auth.service';
import {BookPageParams} from '../data/book-query-params';
import {BookQueryService} from '../data/book-query.service';
import {bookBrowseCollection} from './book-browse-collection';

const PARAMS: BookPageParams = {
  query: 'dune',
  facets: {genre: ['Science Fiction']},
  facetLogic: 'or',
  sort: [{key: 'title', direction: 'asc'}],
  size: 20,
};

describe('bookBrowseCollection', () => {
  let service: BookQueryService;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        {provide: AuthService, useValue: createAuthServiceStub()},
        BookQueryService,
      ],
    });
    service = TestBed.inject(BookQueryService);
  });

  it('binds pages, facets, and IDs to one normalized collection intent', () => {
    const collection = bookBrowseCollection(service, {
      ...PARAMS,
      query: '  dune  ',
      facets: {genre: ['Science Fiction', 'Science Fiction']},
    });
    const equivalent = bookBrowseCollection(service, PARAMS);

    expect(collection.membershipIdentity).toBe(equivalent.membershipIdentity);
    expect(collection.orderingIdentity).toBe(equivalent.orderingIdentity);
    expect(collection.infinitePage(20).queryKey).toEqual(service.infinitePage(PARAMS).queryKey);
    expect(collection.facets().queryKey).toEqual(service.facets(PARAMS).queryKey);
    expect(collection.ids().queryKey).toEqual(service.ids(PARAMS).queryKey);
    expect(collection.infinitePage(50).queryKey).not.toEqual(collection.infinitePage(20).queryKey);
  });

  it('distinguishes collection membership from ordering', () => {
    const collection = bookBrowseCollection(service, PARAMS);
    const differentlySizedPage = {...PARAMS, size: 50};
    const differentlyOrdered = bookBrowseCollection(service, {
      ...PARAMS,
      sort: [{key: 'title', direction: 'desc'}],
    });
    const differentlyFiltered = bookBrowseCollection(service, {...PARAMS, query: 'foundation'});

    expect(bookBrowseCollection(service, differentlySizedPage).membershipIdentity)
      .toBe(collection.membershipIdentity);
    expect(bookBrowseCollection(service, differentlySizedPage).orderingIdentity)
      .toBe(collection.orderingIdentity);
    expect(differentlyOrdered.membershipIdentity).toBe(collection.membershipIdentity);
    expect(differentlyOrdered.orderingIdentity).not.toBe(collection.orderingIdentity);
    expect(differentlyFiltered.membershipIdentity).not.toBe(collection.membershipIdentity);
    expect(differentlyFiltered.orderingIdentity).not.toBe(collection.orderingIdentity);
  });
});
