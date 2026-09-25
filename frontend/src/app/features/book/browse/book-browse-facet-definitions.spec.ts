import {describe, expect, it} from 'vitest';

import {browseFilterGroups, browseFrozenFacetOrders, withBrowseFacetRange} from '../../../shared/browse/facets';
import {type BrowseFacetGroup} from '../../../core/data/browse.models';
import {bookFacetDefinitions} from './book-browse-facet-definitions';

function group(key: string, values: [string, number][]): BrowseFacetGroup {
  return {
    key,
    title: key,
    values: values.map(([value, count]) => ({value, title: value, count, selected: false})),
  };
}

const definitions = bookFacetDefinitions({
  shelf: () => undefined,
  library: () => undefined,
  translate: (key: string) => key,
});

const AVAILABLE = new Set(['genre', 'page_count', 'goodreads_rating']);

describe('book browse facets', () => {
  it('keeps the frozen value order when the server re-ranks, narrows or grows a group', () => {
    const frozen = browseFrozenFacetOrders([group('genre', [['Gothic', 40], ['Comedy', 30], ['Drama', 20]])], definitions);

    const reranked = browseFilterGroups(
      AVAILABLE,
      [group('genre', [['Drama', 90], ['Gothic', 5], ['Comedy', 2]])],
      frozen,
      definitions,
      {},
    );
    expect(reranked[0].values.map(item => [item.value, item.count]))
      .toEqual([['Gothic', 5], ['Comedy', 2], ['Drama', 90]]);

    const narrowed = browseFilterGroups(AVAILABLE, [group('genre', [['Comedy', 7]])], frozen, definitions, {});
    expect(narrowed[0].values.map(item => [item.value, item.count]))
      .toEqual([['Comedy', 7], ['Gothic', 0], ['Drama', 0]]);

    const selectedAtZero = browseFilterGroups(AVAILABLE, [group('genre', [['Comedy', 7], ['Gothic', 0]])], frozen, definitions, {genre: ['Gothic']});
    expect(selectedAtZero[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama']);

    const grown = browseFilterGroups(
      AVAILABLE,
      [group('genre', [['Farce', 3], ['Gothic', 40], ['Comedy', 30], ['Drama', 20]])],
      frozen,
      definitions,
      {},
    );
    expect(grown[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama', 'Farce']);
  });

  it('replaces a numeric range token rather than stacking it, and keeps band selections', () => {
    let selection = withBrowseFacetRange({}, 'page_count', 100, 400, new Set());
    expect(selection).toEqual({page_count: ['100..400']});
    selection = withBrowseFacetRange(selection, 'page_count', null, 200, new Set());
    expect(selection).toEqual({page_count: ['*..200']});
    expect(withBrowseFacetRange(selection, 'page_count', null, null, new Set())).toEqual({});
    expect(withBrowseFacetRange({match_score: ['70..80', '10..20']}, 'match_score', 30, 90, new Set(['70..80'])))
      .toEqual({match_score: ['70..80', '30..90']});
  });

  it('takes slider bounds from the served min and max', () => {
    const pageCount = browseFilterGroups(AVAILABLE, [{...group('page_count', []), min: 12, max: 2400}], {}, definitions, {})
      .find(item => item.key === 'page_count')!;

    expect(pageCount.range).toMatchObject({boundsMin: 12, boundsMax: 2400});
    expect(pageCount.values).toEqual([]);
  });

  it('draws the served bands in order, with stars up to the top of each band', () => {
    const goodreads = browseFilterGroups(
      AVAILABLE,
      [group('goodreads_rating', [['3..4', 151], ['4..4.5', 0], ['4.5..*', 2]])],
      {},
      definitions,
      {goodreads_rating: ['4.5..*']},
    ).find(item => item.key === 'goodreads_rating')!;

    expect(goodreads.values.map(item => [item.value, item.count, item.selected, item.stars?.value])).toEqual([
      ['3..4', 151, false, 4],
      ['4..4.5', 0, false, 4.5],
      ['4.5..*', 2, true, 5],
    ]);
  });

  it('shows every facet with values before its values load', () => {
    const groups = browseFilterGroups(AVAILABLE, [], {}, definitions, {author: ['Alice']});

    expect(groups.map(item => item.key)).toEqual(['author', 'genre', 'page_count', 'goodreads_rating']);
  });
});
