import {describe, expect, it} from 'vitest';

import {
  BookPageParams,
  normalizeBookBatchParams,
  normalizeBookCollectionFilterParams,
  normalizeBookId,
  normalizeBookQueryParams,
  normalizeBookPageParams,
  normalizeRecommendationLimit,
  toCollectionHttpParams,
  toIdsHttpParams,
  toPageHttpParams,
} from './book-query-params';

describe('book query parameters', () => {
  it('normalizes equivalent queries and facet selections', () => {
    const first = normalizeBookPageParams({
      query: '  dune  ',
      facets: {
        language: [' French ', 'English'],
        genre: [' Science Fiction ', 'Fantasy', 'Science Fiction', ' '],
      },
      facetLogic: 'or',
      sort: [{key: 'title', direction: 'asc'}],
      size: 40,
    });
    const second = normalizeBookPageParams({
      query: 'dune',
      facets: {
        genre: ['Fantasy', 'Science Fiction'],
        language: ['English', 'French'],
      },
      facetLogic: 'or',
      sort: [{key: 'title', direction: 'asc'}],
      size: 40,
    });

    expect(first).toEqual(second);
    expect(first.facets).toEqual({
      genre: ['Fantasy', 'Science Fiction'],
      language: ['English', 'French'],
    });
  });

  it('rejects an unsupported outbound facet key received at runtime', () => {
    const params = {
      facets: {narrator: ['A Narrator']},
      facetLogic: 'or',
      sort: [],
      size: 20,
    } as unknown as BookPageParams;

    expect(() => normalizeBookPageParams(params)).toThrow('Unsupported book query facet key: narrator');
  });

  it('rejects an unsupported outbound sort key received at runtime', () => {
    const params = {
      facets: {},
      facetLogic: 'or',
      sort: [{key: ' futureScore ', direction: 'desc'}],
      size: 20,
    } as unknown as BookPageParams;

    expect(() => normalizeBookPageParams(params)).toThrow('Unsupported book query sort key: futureScore');
  });

  it('rejects a prototype-named facet key as unsupported', () => {
    const params = {
      facets: Object.fromEntries([['__proto__', ['READ']]]),
      facetLogic: 'or',
      sort: [],
      size: 20,
    } as unknown as BookPageParams;

    expect(() => normalizeBookPageParams(params)).toThrow('Unsupported book query facet key: __proto__');
  });

  it('rejects an empty sort key', () => {
    const params = {
      facets: {},
      facetLogic: 'or',
      sort: [{key: '  ', direction: 'asc'}],
      size: 20,
    } as unknown as BookPageParams;

    expect(() => normalizeBookPageParams(params)).toThrow('Book query sort key must not be empty.');
  });

  it('rejects a blank facet key', () => {
    const params: BookPageParams = {
      facets: {'  ': ['value']} as unknown as BookPageParams['facets'],
      facetLogic: 'or',
      sort: [],
      size: 20,
    };

    expect(() => normalizeBookPageParams(params)).toThrow('Book query facet key must not be empty.');
  });

  it('uses the browser default title sort when no sort is provided', () => {
    const normalized = normalizeBookQueryParams({
      facets: {},
      facetLogic: 'or',
      sort: [],
    });

    expect(normalized.sort).toEqual([{key: 'title', direction: 'asc'}]);
  });

  it.each([0, 101, 1.5])('rejects invalid page size %s', size => {
    expect(() => normalizeBookPageParams({
      facets: {},
      facetLogic: 'or',
      sort: [],
      size,
    })).toThrow('Book query page size must be between 1 and 100.');
  });

  it('rejects an unsupported sort direction received at runtime', () => {
    const params = {
      facets: {},
      facetLogic: 'or',
      sort: [{key: 'title', direction: 'sideways'}],
      size: 20,
    } as unknown as BookPageParams;

    expect(() => normalizeBookPageParams(params)).toThrow('Unsupported book query sort direction: sideways');
  });

  it.each(['and', 'or', 'not'] as const)('preserves explicit %s facet logic', facetLogic => {
    const normalized = normalizeBookQueryParams({facets: {}, facetLogic, sort: []});

    expect(normalized.facetLogic).toBe(facetLogic);
    expect(toIdsHttpParams(normalized).get('facet_logic')).toBe(facetLogic);
  });

  it('rejects unsupported facet logic received at runtime', () => {
    const params = {
      facets: {},
      facetLogic: 'xor',
      sort: [],
    } as unknown as BookPageParams;

    expect(() => normalizeBookQueryParams(params)).toThrow('Unsupported book query facet logic: xor');
  });

  it('normalizes batch IDs without promising response order', () => {
    expect(normalizeBookBatchParams([9, 3, 9, 5], true)).toEqual({
      bookIds: [3, 5, 9],
      withDescription: true,
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid book ID %s', bookId => {
    expect(() => normalizeBookId(bookId)).toThrow('Book ID must be a positive integer.');
  });

  it('rejects an empty batch', () => {
    expect(() => normalizeBookBatchParams([], false)).toThrow('At least one book ID is required.');
  });

  it.each([0, 26, 1.5])('rejects invalid recommendation limit %s', limit => {
    expect(() => normalizeRecommendationLimit(limit)).toThrow('Book recommendation limit must be between 1 and 25.');
  });

  it('serializes page parameters using the backend vocabulary', () => {
    const params = toPageHttpParams(normalizeBookPageParams({
      query: 'dune',
      facets: {
        genre: ['Science Fiction'],
        shelf: ['magic:12'],
      },
      facetLogic: 'not',
      sort: [
        {key: 'seriesName', direction: 'asc'},
        {key: 'seriesNumber', direction: 'desc'},
      ],
      size: 50,
    }));

    expect(params.get('query')).toBe('dune');
    expect(params.getAll('facet')).toEqual(['genre:Science Fiction', 'shelf:magic:12']);
    expect(params.get('facet_logic')).toBe('not');
    expect(params.get('sort')).toBe('seriesName,-seriesNumber');
    expect(params.get('size')).toBe('50');
    expect(params.has('page')).toBe(false);
    expect(params.has('cursor')).toBe(false);
  });

  it('excludes sort and size from facet requests', () => {
    const params = toCollectionHttpParams(normalizeBookCollectionFilterParams({
      query: 'dune',
      facets: {genre: ['Fantasy']},
      facetLogic: 'and',
    }));

    expect(params.get('query')).toBe('dune');
    expect(params.getAll('facet')).toEqual(['genre:Fantasy']);
    expect(params.get('facet_logic')).toBe('and');
    expect(params.has('sort')).toBe(false);
    expect(params.has('size')).toBe(false);
  });

  it('does not emit facet parameters for an empty selection', () => {
    const params = toCollectionHttpParams(normalizeBookCollectionFilterParams({
      facets: {},
      facetLogic: 'or',
    }));

    expect(params.has('facet')).toBe(false);
  });

  it('includes sort but excludes size from ID requests', () => {
    const params = toIdsHttpParams(normalizeBookQueryParams({
      facets: {},
      facetLogic: 'or',
      sort: [{key: 'title', direction: 'desc'}],
    }));

    expect(params.get('sort')).toBe('-title');
    expect(params.has('size')).toBe(false);
  });
});
