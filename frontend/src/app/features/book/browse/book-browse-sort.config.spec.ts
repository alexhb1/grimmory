import {describe, expect, it} from 'vitest';

import {
  buildSortOptions,
  parseSortTermsToken,
  parseSortToken,
  sortTerms,
  sortTermsToken,
} from './book-browse-sort.config';

describe('book browse sort config', () => {
  it('groups exact server tokens in server order without inventing sort terms', () => {
    const options = buildSortOptions([
      'pageCount', '-pageCount',
      'title', '-title',
      'seriesName', '-seriesName',
      'amazonReviewCount', '-amazonReviewCount',
    ]);

    expect(options.map(option => option.id)).toEqual([
      'pageCount',
      'title',
      'seriesName',
      'amazonReviewCount',
    ]);
    expect(options[0]).toMatchObject({
      labelKey: 'book.filter.labels.pageCount',
      group: 'more',
      defaultDirection: 'desc',
      directions: ['asc', 'desc'],
    });
    expect(options[1]).toMatchObject({
      group: 'common',
      defaultDirection: 'asc',
      directions: ['asc', 'desc'],
    });
    expect(options[2]).toMatchObject({directions: ['asc', 'desc']});
    expect(options[3]).toMatchObject({
      labelKey: 'book.columnPref.columns.amazonReviewCount',
      defaultDirection: 'desc',
      directions: ['asc', 'desc'],
    });
  });

  it('keeps a one-way random capability one-way', () => {
    expect(buildSortOptions(['random'])).toEqual([{
      id: 'random',
      fallbackLabel: 'Random',
      group: 'more',
      defaultDirection: 'asc',
      directions: ['asc'],
    }]);
  });

  it('humanizes unknown server keys and places them in more with ascending default', () => {
    expect(buildSortOptions(['amazonPopularityScore'])).toEqual([{
      id: 'amazonPopularityScore',
      fallbackLabel: 'Amazon Popularity Score',
      group: 'more',
      defaultDirection: 'asc',
      directions: ['asc'],
    }]);
  });

  it('treats prototype-named server keys as unknown keys', () => {
    expect(buildSortOptions(['constructor'])).toEqual([{
      id: 'constructor',
      fallbackLabel: 'Constructor',
      group: 'more',
      defaultDirection: 'asc',
      directions: ['asc'],
    }]);
  });

  it('parses an ordered multi-sort token for the server', () => {
    expect(parseSortTermsToken('-publishedDate,title,seriesNumber')).toEqual([
      {key: 'publishedDate', direction: 'desc'},
      {key: 'title', direction: 'asc'},
      {key: 'seriesNumber', direction: 'asc'},
    ]);
  });

  it('passes unknown terms through and deduplicates without changing precedence', () => {
    expect(parseSortTermsToken('title,futureScore,-title,-pageCount')).toEqual([
      {key: 'title', direction: 'asc'},
      {key: 'futureScore', direction: 'asc'},
      {key: 'pageCount', direction: 'desc'},
    ]);
  });

  it('ignores empty keys after stripping the direction marker', () => {
    expect(parseSortTermsToken(',-, ,title')).toEqual([
      {key: 'title', direction: 'asc'},
    ]);
  });

  it('serializes the ordered chain', () => {
    expect(sortTermsToken([
      {key: 'seriesName', direction: 'asc'},
      {key: 'seriesNumber', direction: 'desc'},
    ])).toBe('seriesName,-seriesNumber');
  });

  it('uses the first non-empty term for the compact toolbar label', () => {
    expect(parseSortToken('futureScore,-pageCount,title')).toEqual({
      option: {
        id: 'futureScore',
        fallbackLabel: 'Future Score',
        group: 'more',
        defaultDirection: 'asc',
        directions: ['asc'],
      },
      direction: 'asc',
    });
  });

  it('labels newly reachable table fields from the existing column vocabulary', () => {
    expect(parseSortToken('-seriesNumber')).toEqual({
      option: {
        id: 'seriesNumber',
        labelKey: 'book.columnPref.columns.seriesNumber',
        fallbackLabel: 'Series Number',
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
