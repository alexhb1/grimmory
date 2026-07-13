import {describe, expect, it} from 'vitest';

import {
  BookPageParams,
  normalizeBookBatchParams,
  normalizeBookFacetParams,
  normalizeBookId,
  normalizeBookIdsParams,
  normalizeBookPageParams,
  normalizeBookPageAtParams,
  normalizeRecommendationLimit,
  toFacetHttpParams,
  toIdsHttpParams,
  toPageHttpParams,
  toPageAtHttpParams,
} from './book-query-params';

describe('book query parameters', () => {
  it('normalizes equivalent queries and facet selections', () => {
    const first = normalizeBookPageParams({
      query: '  dune  ',
      facets: {
        any: {
          language: [' French ', 'English'],
          genre: [' Science Fiction ', 'Fantasy', 'Science Fiction', ' '],
        },
        must: {
          library: [' Secondary ', 'Main', 'Main'],
        },
        not: {
          tag: ['Spoiler', ' Abandoned ', 'Spoiler'],
        },
      },
      sort: [{key: 'title', direction: 'asc'}],
      size: 40,
    });
    const second = normalizeBookPageParams({
      query: 'dune',
      facets: {
        any: {
          genre: ['Fantasy', 'Science Fiction'],
          language: ['English', 'French'],
        },
        must: {
          library: ['Main', 'Secondary'],
        },
        not: {
          tag: ['Abandoned', 'Spoiler'],
        },
      },
      sort: [{key: 'title', direction: 'asc'}],
      size: 40,
    });

    expect(first).toEqual(second);
    expect(first.facets).toEqual({
      any: {
        genre: ['Fantasy', 'Science Fiction'],
        language: ['English', 'French'],
      },
      must: {library: ['Main', 'Secondary']},
      not: {tag: ['Abandoned', 'Spoiler']},
    });
  });

  it.each(['any', 'must', 'not'] as const)(
    'passes an unknown outbound facet through in the %s bucket',
    bucket => {
      const params = {
        facets: {
          any: {},
          must: {},
          not: {},
          [bucket]: {narrator: ['A Narrator']},
        },
        sort: [],
        size: 20,
      } satisfies BookPageParams;

      expect(normalizeBookPageParams(params).facets[bucket]).toEqual({narrator: ['A Narrator']});
    },
  );

  it('passes an unknown sort key through after trimming it', () => {
    const normalized = normalizeBookPageParams({
      facets: {any: {}, must: {}, not: {}},
      sort: [{key: ' futureScore ', direction: 'desc'}],
      size: 20,
    });

    expect(normalized.sort).toEqual([{key: 'futureScore', direction: 'desc'}]);
  });

  it('passes prototype-named facet keys through as ordinary own properties', () => {
    const normalized = normalizeBookPageParams({
      facets: {
        any: Object.fromEntries([['__proto__', ['READ']]]),
        must: {},
        not: {},
      },
      sort: [],
      size: 20,
    });

    expect(Object.hasOwn(normalized.facets.any, '__proto__')).toBe(true);
    expect(toPageHttpParams(normalized).getAll('facet')).toEqual(['__proto__:READ']);
  });

  it('rejects an empty sort key', () => {
    expect(() => normalizeBookPageParams({
      facets: {any: {}, must: {}, not: {}},
      sort: [{key: '  ', direction: 'asc'}],
      size: 20,
    })).toThrow('Book query sort key must not be empty.');
  });

  it.each(['any', 'must', 'not'] as const)('rejects a blank facet key in the %s bucket', bucket => {
    const params: BookPageParams = {
      facets: {any: {}, must: {}, not: {}, [bucket]: {'  ': ['value']}},
      sort: [],
      size: 20,
    };

    expect(() => normalizeBookPageParams(params)).toThrow('Book query facet key must not be empty.');
  });

  it('uses the default descending added-date sort when no sort is provided', () => {
    const normalized = normalizeBookIdsParams({
      facets: {any: {}, must: {}, not: {}},
      sort: [],
    });

    expect(normalized.sort).toEqual([{key: 'addedOn', direction: 'desc'}]);
  });

  it.each([0, 101, 1.5])('rejects invalid page size %s', size => {
    expect(() => normalizeBookPageParams({
      facets: {any: {}, must: {}, not: {}},
      sort: [],
      size,
    })).toThrow('Book query page size must be between 1 and 100.');
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid page number %s', page => {
    expect(() => normalizeBookPageAtParams({
      facets: {any: {}, must: {}, not: {}},
      sort: [],
      size: 20,
      page,
    })).toThrow('Book query page number must be a non-negative integer.');
  });

  it('rejects an unsupported sort direction received at runtime', () => {
    const params = {
      facets: {any: {}, must: {}, not: {}},
      sort: [{key: 'title', direction: 'sideways'}],
      size: 20,
    } as unknown as BookPageParams;

    expect(() => normalizeBookPageParams(params)).toThrow('Unsupported book query sort direction: sideways');
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
        any: {
          genre: ['Science Fiction'],
          shelf: ['magic:12'],
        },
        must: {
          language: ['English'],
        },
        not: {
          tag: ['Abandoned'],
        },
      },
      sort: [
        {key: 'seriesName', direction: 'asc'},
        {key: 'seriesNumber', direction: 'desc'},
      ],
      size: 50,
    }));

    expect(params.get('query')).toBe('dune');
    expect(params.getAll('facet')).toEqual(['genre:Science Fiction', 'shelf:magic:12']);
    expect(params.getAll('facet_must')).toEqual(['language:English']);
    expect(params.getAll('facet_not')).toEqual(['tag:Abandoned']);
    expect(params.get('sort')).toBe('seriesName,-seriesNumber');
    expect(params.get('size')).toBe('50');
    expect(params.has('cursor')).toBe(false);
  });

  it('serializes a direct-offset page number alongside the bounded page parameters', () => {
    const params = toPageAtHttpParams(normalizeBookPageAtParams({
      facets: {any: {}, must: {}, not: {}},
      sort: [{key: 'title', direction: 'asc'}],
      size: 60,
      page: 7,
    }));

    expect(params.get('sort')).toBe('title');
    expect(params.get('size')).toBe('60');
    expect(params.get('page')).toBe('7');
  });

  it('excludes sort and size from facet requests', () => {
    const params = toFacetHttpParams(normalizeBookFacetParams({
      query: 'dune',
      facets: {
        any: {genre: ['Fantasy']},
        must: {},
        not: {},
      },
      sort: [{key: 'title', direction: 'asc'}],
    }));

    expect(params.get('query')).toBe('dune');
    expect(params.getAll('facet')).toEqual(['genre:Fantasy']);
    expect(params.has('sort')).toBe(false);
    expect(params.has('size')).toBe(false);
  });

  it('does not emit facet parameters for empty buckets', () => {
    const params = toFacetHttpParams(normalizeBookFacetParams({
      facets: {any: {}, must: {}, not: {}},
      sort: [],
    }));

    expect(params.has('facet')).toBe(false);
    expect(params.has('facet_must')).toBe(false);
    expect(params.has('facet_not')).toBe(false);
  });

  it('includes sort but excludes size from ID requests', () => {
    const params = toIdsHttpParams(normalizeBookIdsParams({
      facets: {any: {}, must: {}, not: {}},
      sort: [{key: 'title', direction: 'desc'}],
    }));

    expect(params.get('sort')).toBe('-title');
    expect(params.has('size')).toBe(false);
  });
});
