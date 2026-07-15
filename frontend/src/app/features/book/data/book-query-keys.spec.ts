import {describe, expect, it} from 'vitest';

import {
  normalizeBookBatchParams,
  normalizeBookCollectionFilterParams,
  normalizeBookQueryParams,
  normalizeBookPageParams,
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

  it('roots every read under the unified book-query prefix', () => {
    const keys = [
      bookQueryKeys.boundedPage(page),
      bookQueryKeys.infinitePage(page),
      bookQueryKeys.facets(normalizeBookCollectionFilterParams(query)),
      bookQueryKeys.ids(normalizeBookQueryParams(query)),
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
    expect(bookQueryKeys.boundedPage(page)).not.toEqual(bookQueryKeys.infinitePage(page));
    expect(bookQueryKeys.boundedPage(page).at(-1)).toBe(page);
    expect(bookQueryKeys.infinitePage(page).at(-1)).toBe(page);
  });

  it('keeps facet bucket placement as part of query identity', () => {
    const anyGenre = normalizeBookCollectionFilterParams(query);
    const requiredGenre = normalizeBookCollectionFilterParams({
      ...query,
      facets: {
        any: {},
        must: {genre: ['Fantasy']},
        not: {},
      },
    });

    expect(bookQueryKeys.facets(anyGenre)).not.toEqual(bookQueryKeys.facets(requiredGenre));
  });

  it('nests every leaf under the prefix its invalidation targets', () => {
    const detailPrefix = bookQueryKeys.detailQueries(12);
    expect(bookQueryKeys.detail(12, true).slice(0, detailPrefix.length)).toEqual([...detailPrefix]);

    const recommendationPrefix = bookQueryKeys.recommendationQueries(12);
    expect(bookQueryKeys.recommendation(12, 20).slice(0, recommendationPrefix.length))
      .toEqual([...recommendationPrefix]);

    expect(bookQueryKeys.batch(normalizeBookBatchParams([12, 4, 12], false)).at(-1))
      .toEqual({bookIds: [4, 12], withDescription: false});
  });
});
