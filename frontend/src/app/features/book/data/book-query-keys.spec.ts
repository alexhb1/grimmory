import {describe, expect, it} from 'vitest';

import {
  normalizeBookBatchParams,
  normalizeBookFacetParams,
  normalizeBookIdsParams,
  normalizeBookPageParams,
  normalizeBookPageAtParams,
} from './book-query-params';
import {bookQueryKeys} from './book-query-keys';

describe('book query keys', () => {
  const query = {
    query: 'dune',
    facets: {
      any: {genre: ['Fantasy']},
      must: {},
      not: {},
    } as const,
    sort: [{key: 'title', direction: 'asc'}] as const,
  };
  const page = normalizeBookPageParams({...query, size: 20});
  const windowedPage = normalizeBookPageAtParams({...query, size: 20, page: 7});

  it('roots every read under the unified book-query prefix', () => {
    const keys = [
      bookQueryKeys.boundedPage(page),
      bookQueryKeys.infinitePage(page),
      bookQueryKeys.windowedPage(windowedPage),
      bookQueryKeys.facets(normalizeBookFacetParams(query)),
      bookQueryKeys.ids(normalizeBookIdsParams(query)),
      bookQueryKeys.detail(12, true),
      bookQueryKeys.batch(normalizeBookBatchParams([12, 4], false)),
      bookQueryKeys.recommendation(12, 20),
    ];

    expect(bookQueryKeys.all()).toEqual(['books', 'query']);
    for (const key of keys) {
      expect(key.slice(0, 2)).toEqual(bookQueryKeys.all());
    }
  });

  it('keeps bounded and infinite data shapes on different leaves', () => {
    expect(bookQueryKeys.boundedPage(page)).toEqual([
      'books', 'query', 'collection', 'page', 'bounded', page,
    ]);
    expect(bookQueryKeys.infinitePage(page)).toEqual([
      'books', 'query', 'collection', 'page', 'infinite', page,
    ]);
    expect(bookQueryKeys.windowedPage(windowedPage)).toEqual([
      'books', 'query', 'collection', 'page', 'windowed', windowedPage,
    ]);
  });

  it('keeps facet bucket placement as part of query identity', () => {
    const anyGenre = normalizeBookFacetParams(query);
    const requiredGenre = normalizeBookFacetParams({
      ...query,
      facets: {
        any: {},
        must: {genre: ['Fantasy']},
        not: {},
      },
    });

    expect(bookQueryKeys.facets(anyGenre)).not.toEqual(bookQueryKeys.facets(requiredGenre));
  });

  it('provides stable detail, batch, and recommendation leaves', () => {
    expect(bookQueryKeys.detailQueries(12)).toEqual([
      'books', 'query', 'detail', 12,
    ]);
    expect(bookQueryKeys.detail(12, true)).toEqual([
      'books', 'query', 'detail', 12, {withDescription: true},
    ]);
    expect(bookQueryKeys.batch(normalizeBookBatchParams([12, 4, 12], false))).toEqual([
      'books', 'query', 'batch', {bookIds: [4, 12], withDescription: false},
    ]);
    expect(bookQueryKeys.recommendationQueries(12)).toEqual([
      'books', 'query', 'recommendation', 12,
    ]);
    expect(bookQueryKeys.recommendation(12, 20)).toEqual([
      'books', 'query', 'recommendation', 12, {limit: 20},
    ]);
  });
});
