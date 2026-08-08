import {describe, expect, it} from 'vitest';

import {
  browseFacetQueryParams,
  countFacetSelections,
  EMPTY_FACET_SELECTION,
  parseFacetParams,
  toggleFacetSelection,
} from '../data/book-query-params';
import {type BookFacetGroup} from '../data/book-query.models';
import {
  buildRailGroups,
  freezeFacetOrders,
  orderedFacetVocabularyKeys,
} from './book-browse-fields';

function group(
  key: string,
  title: string,
  values: [string, number, boolean?][],
): BookFacetGroup {
  return {
    key,
    title,
    values: values.map(([value, count, selected]) => ({value, title: value, count, selected: selected ?? false})),
  };
}

describe('frozen facet orders', () => {
  const initial = [group('genre', 'Genre', [['Gothic', 40], ['Comedy', 30], ['Drama', 20]])];
  const frozen = freezeFacetOrders(initial);

  it('keeps the frozen order when the server re-ranks', () => {
    const reranked = [group('genre', 'Genre', [['Drama', 90], ['Gothic', 5], ['Comedy', 2]])];
    const groups = buildRailGroups(reranked, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama']);
    expect(groups[0].values.map(item => item.count)).toEqual([5, 2, 90]);
  });

  it('sinks values missing from the response below the available ones, as zeros', () => {
    const narrowed = [group('genre', 'Genre', [['Comedy', 7]])];
    const groups = buildRailGroups(narrowed, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Comedy', 'Gothic', 'Drama']);
    expect(groups[0].values.map(item => item.count)).toEqual([7, 0, 0]);
  });

  it('keeps frozen relative order within the available and zeroed partitions', () => {
    const narrowed = [group('genre', 'Genre', [['Drama', 9], ['Gothic', 4]])];
    const groups = buildRailGroups(narrowed, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Drama', 'Comedy']);
  });

  it('keeps a selected zero-count value in the available partition', () => {
    const narrowed = [group('genre', 'Genre', [['Comedy', 7], ['Gothic', 0, true]])];
    const groups = buildRailGroups(narrowed, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama']);
    expect(groups[0].values[0]).toMatchObject({selected: true, count: 0});
  });

  it('renders a fully absent group from the snapshot, all zeros', () => {
    const groups = buildRailGroups([], frozen);
    expect(groups[0].values.map(item => item.count)).toEqual([0, 0, 0]);
  });

  it('appends newly served values after the frozen order', () => {
    const grown = [group('genre', 'Genre', [['Farce', 3], ['Gothic', 40], ['Comedy', 30], ['Drama', 20]])];
    const groups = buildRailGroups(grown, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama', 'Farce']);
  });

  it('marks selections regardless of position or count', () => {
    const narrowed = [group('genre', 'Genre', [['Comedy', 7], ['Drama', 0, true]])];
    const groups = buildRailGroups(narrowed, frozen);
    const drama = groups[0].values.find(item => item.value === 'Drama');
    expect(drama).toMatchObject({selected: true, count: 0});
  });

  it('falls back to served order without a snapshot', () => {
    const groups = buildRailGroups(initial);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama']);
  });

  it('flags only the whitelisted browsing axes as open by default', () => {
    const served = [
      group('genre', 'Genre', [['Gothic', 1]]),
      group('publisher', 'Publisher', [['Foyle & Sons', 1]]),
    ];
    const groups = buildRailGroups(served);
    expect(groups.map(g => [g.key, g.defaultOpen])).toEqual([
      ['genre', true],
      ['publisher', false],
    ]);
  });

  it('selecting a value never moves it (Baymard: untick where you ticked)', () => {
    const served = [group('genre', 'Genre', [['Gothic', 40], ['Comedy', 30], ['Drama', 20]])];
    const picked = [group('genre', 'Genre', [['Gothic', 40], ['Comedy', 30, true], ['Drama', 20]])];
    const unselected = buildRailGroups(served, frozen)[0].values.map(item => item.value);
    const selected = buildRailGroups(picked, frozen)[0].values.map(item => item.value);
    expect(selected).toEqual(unselected);
  });

  it('ignores served groups outside the accepted backend filter vocabulary', () => {
    const served = [
      group('binding', 'Binding', [['Hardback', 2]]),
      group('genre', 'Genre', [['Gothic', 1]]),
      group('award', 'Award', [['Hugo', 1]]),
    ];

    expect(buildRailGroups(served).map(item => item.key))
      .toEqual(['genre']);
  });

  it('orders the frozen and newly served union before applying rail preferences', () => {
    const frozenHere = freezeFacetOrders([
      group('binding', 'Binding', [['Hardback', 2]]),
      group('publisher', 'Publisher', [['Tor', 1]]),
    ]);
    const served = [
      group('award', 'Award', [['Hugo', 1]]),
      group('author', 'Author', [['Le Guin', 1]]),
    ];

    expect(orderedFacetVocabularyKeys(served, frozenHere))
      .toEqual(['author', 'publisher']);
    expect(buildRailGroups(served, frozenHere).map(item => item.key))
      .toEqual(['author', 'publisher']);
  });

  it('renders an explicitly served empty accepted group with an empty frozen vocabulary', () => {
    const served = [group('publisher', 'Publisher', [])];
    const frozenHere = freezeFacetOrders(served);

    expect(buildRailGroups(served, frozenHere)).toEqual([{
      key: 'publisher',
      labelKey: 'book.fields.publisher',
      defaultOpen: false,
      values: [],
    }]);
  });
});

describe('facet selection params', () => {
  it('parses facet route params into a value map', () => {
    expect(parseFacetParams(['genre:Comedy', 'genre:Drama', 'tag:Anthology'])).toEqual({
      genre: ['Comedy', 'Drama'],
      tag: ['Anthology'],
    });
  });

  it('drops unknown facet keys while preserving accepted values', () => {
    expect(parseFacetParams(['read_status:READ', 'future_group:a:b', 'future_group:a:b'])).toEqual({
      read_status: ['READ'],
    });
  });

  it('drops prototype-named facet keys', () => {
    const selection = parseFacetParams(['__proto__:READ']);

    expect(selection).toEqual({});
    expect(buildRailGroups([group('__proto__', 'Prototype', [['READ', 1, true]])])).toEqual([]);
  });

  it('serializes the selection to router params, null when empty', () => {
    expect(browseFacetQueryParams({genre: ['Comedy']})).toEqual({facet: ['genre:Comedy']});
    expect(browseFacetQueryParams({})).toEqual({facet: null});
  });

  it('round-trips a selection through params and back', () => {
    const selection = parseFacetParams(['genre:Comedy', 'tag:Anthology']);
    const params = browseFacetQueryParams(selection);
    expect(parseFacetParams(params.facet ?? [])).toEqual(selection);
  });

  it('toggles a value in and out of the selection', () => {
    let selection = toggleFacetSelection(EMPTY_FACET_SELECTION, 'genre', 'History', true);
    expect(selection).toEqual({genre: ['History']});

    selection = toggleFacetSelection(selection, 'genre', 'Comedy', true);
    expect(selection).toEqual({genre: ['History', 'Comedy']});

    selection = toggleFacetSelection(selection, 'genre', 'History', false);
    expect(selection).toEqual({genre: ['Comedy']});

    selection = toggleFacetSelection(selection, 'genre', 'Comedy', false);
    expect(selection).toEqual({});
  });

  it('returns the same selection when a toggle is a no-op', () => {
    const selection = {genre: ['History']};
    expect(toggleFacetSelection(selection, 'genre', 'History', true)).toBe(selection);
    expect(toggleFacetSelection(selection, 'tag', 'Owned', false)).toBe(selection);
  });

  it('counts selected values across keys', () => {
    expect(countFacetSelections({genre: ['Comedy', 'Drama'], tag: ['Anthology']})).toBe(3);
    expect(countFacetSelections(EMPTY_FACET_SELECTION)).toBe(0);
  });
});
