import {describe, expect, it} from 'vitest';

import {
  parseSortTermsToken,
  sortTermsToken,
} from '../data/book-query-params';
import {
  buildSortOptions,
  parseSortToken,
  sortTerms,
} from './book-browse-fields';

describe('book browse sort fields', () => {
  it('groups exact server tokens in the browser order without inventing sort terms', () => {
    const options = buildSortOptions([
      'pageCount', '-pageCount',
      'title', '-title',
      'seriesName', '-seriesName',
      'amazonReviewCount', '-amazonReviewCount',
    ]);

    expect(options.map(option => option.id)).toEqual([
      'title',
      'seriesName',
      'pageCount',
      'amazonReviewCount',
    ]);
    expect(options[0]).toMatchObject({
      group: 'common',
      defaultDirection: 'asc',
      directions: ['asc', 'desc'],
    });
    expect(options[1]).toMatchObject({directions: ['asc', 'desc']});
    expect(options[2]).toMatchObject({
      labelKey: 'book.fields.pageCount',
      group: 'more',
      defaultDirection: 'desc',
      directions: ['asc', 'desc'],
    });
    expect(options[3]).toMatchObject({
      labelKey: 'book.fields.amazonReviewCount',
      defaultDirection: 'desc',
      directions: ['asc', 'desc'],
    });
    expect(buildSortOptions(['futureScore', '-title']).map(option => option.id)).toEqual(['title']);
  });

  it('round-trips a multi-sort token, dropping junk and duplicate terms', () => {
    expect(parseSortTermsToken('title,futureScore,-title,,-, ,-pageCount')).toEqual([
      {key: 'title', direction: 'asc'},
      {key: 'pageCount', direction: 'desc'},
    ]);
    expect(sortTermsToken([
      {key: 'title', direction: 'asc'},
      {key: 'pageCount', direction: 'desc'},
    ])).toBe('title,-pageCount');
  });

  it('uses the first supported term for the compact toolbar label', () => {
    expect(parseSortToken('futureScore,-pageCount,title')).toEqual({
      option: {
        id: 'pageCount',
        labelKey: 'book.fields.pageCount',
        group: 'more',
        defaultDirection: 'desc',
        directions: ['desc'],
      },
      direction: 'desc',
    });
  });

  it('serializes only the selected backend capability without frontend tiebreakers', () => {
    const [series] = buildSortOptions(['seriesName', '-seriesName']);

    expect(sortTerms({option: series, direction: 'asc'})).toEqual([
      {key: 'seriesName', direction: 'asc'},
    ]);
  });
});
