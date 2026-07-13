import {describe, expect, it} from 'vitest';

import {EMPTY_FACET_SELECTION, type BookFacetSelection} from '../data/book-query-params';
import {type BookFacetGroup} from '../data/book-query.models';
import {
  browseFacetQueryParams,
  buildRailGroups,
  countFacetSelections,
  cycleFacetValue,
  facetValueState,
  freezeFacetOrders,
  orderedFacetVocabularyKeys,
  parseBrowseFacetSelection,
  setFacetValueState,
  toggleFacetSelection,
} from './book-browse-facets';

function group(
  key: string,
  title: string,
  values: [string, number][],
  rel = 'facet',
): BookFacetGroup {
  return {
    rel,
    key,
    title,
    values: values.map(([value, count]) => ({value, title: value, count})),
  };
}

function anyOf(facets: BookFacetSelection['any']): BookFacetSelection {
  return {...EMPTY_FACET_SELECTION, any: facets};
}

describe('frozen facet orders', () => {
  const initial = [group('genre', 'Genre', [['Gothic', 40], ['Comedy', 30], ['Drama', 20]])];
  const frozen = freezeFacetOrders(initial);

  it('keeps the frozen order when the server re-ranks', () => {
    const reranked = [group('genre', 'Genre', [['Drama', 90], ['Gothic', 5], ['Comedy', 2]])];
    const groups = buildRailGroups(reranked, EMPTY_FACET_SELECTION, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama']);
    expect(groups[0].values.map(item => item.count)).toEqual([5, 2, 90]);
  });

  it('sinks values missing from the response below the available ones, as zeros', () => {
    const narrowed = [group('genre', 'Genre', [['Comedy', 7]])];
    const groups = buildRailGroups(narrowed, EMPTY_FACET_SELECTION, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Comedy', 'Gothic', 'Drama']);
    expect(groups[0].values.map(item => item.count)).toEqual([7, 0, 0]);
  });

  it('keeps frozen relative order within the available and zeroed partitions', () => {
    const narrowed = [group('genre', 'Genre', [['Drama', 9], ['Gothic', 4]])];
    const groups = buildRailGroups(narrowed, EMPTY_FACET_SELECTION, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Drama', 'Comedy']);
  });

  it('keeps a selected zero-count value in the available partition', () => {
    const narrowed = [group('genre', 'Genre', [['Comedy', 7]])];
    const groups = buildRailGroups(narrowed, anyOf({genre: ['Gothic']}), frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama']);
    expect(groups[0].values[0]).toMatchObject({selected: true, count: 0});
  });

  it('renders a fully absent group from the snapshot, all zeros', () => {
    const groups = buildRailGroups([], EMPTY_FACET_SELECTION, frozen);
    expect(groups[0].values.map(item => item.count)).toEqual([0, 0, 0]);
  });

  it('appends newly served values after the frozen order', () => {
    const grown = [group('genre', 'Genre', [['Farce', 3], ['Gothic', 40], ['Comedy', 30], ['Drama', 20]])];
    const groups = buildRailGroups(grown, EMPTY_FACET_SELECTION, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama', 'Farce']);
  });

  it('marks selections regardless of position or count', () => {
    const narrowed = [group('genre', 'Genre', [['Comedy', 7]])];
    const groups = buildRailGroups(narrowed, anyOf({genre: ['Drama']}), frozen);
    const drama = groups[0].values.find(item => item.value === 'Drama');
    expect(drama).toMatchObject({selected: true, count: 0});
  });

  it('falls back to served order without a snapshot', () => {
    const groups = buildRailGroups(initial, EMPTY_FACET_SELECTION);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama']);
  });

  it('flags only the whitelisted browsing axes as open by default', () => {
    const served = [
      group('genre', 'Genre', [['Gothic', 1]]),
      group('publisher', 'Publisher', [['Foyle & Sons', 1]]),
    ];
    const groups = buildRailGroups(served, EMPTY_FACET_SELECTION);
    expect(groups.map(g => [g.key, g.defaultOpen])).toEqual([
      ['genre', true],
      ['publisher', false],
    ]);
  });

  it('marks must and not values selected like ordinary ticks', () => {
    const narrowed = [group('genre', 'Genre', [['Comedy', 7]])];
    const selection: BookFacetSelection = {any: {}, must: {genre: ['Gothic']}, not: {genre: ['Drama']}};
    const groups = buildRailGroups(narrowed, selection, frozen);
    expect(groups[0].values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama']);
    expect(groups[0].values.filter(item => item.selected).map(item => item.value))
      .toEqual(['Gothic', 'Drama']);
  });

  it('selecting a value never moves it (Baymard: untick where you ticked)', () => {
    const served = [group('genre', 'Genre', [['Gothic', 40], ['Comedy', 30], ['Drama', 20]])];
    const unselected = buildRailGroups(served, EMPTY_FACET_SELECTION, frozen)[0].values.map(item => item.value);
    const picked = buildRailGroups(served, anyOf({genre: ['Comedy']}), frozen)[0].values.map(item => item.value);
    expect(picked).toEqual(unselected);
  });

  it('freezes order in a group with its own required value: counts change, nothing sinks', () => {
    const served = [group('genre', 'Genre', [['Gothic', 40], ['Comedy', 30], ['Drama', 20]])];
    const narrowed = [group('genre', 'Genre', [['Gothic', 40], ['Drama', 5]])];
    const frozenHere = freezeFacetOrders(served);
    const selection: BookFacetSelection = {any: {}, must: {genre: ['Gothic']}, not: {}};

    const values = buildRailGroups(narrowed, selection, frozenHere)[0].values;
    expect(values.map(item => item.value)).toEqual(['Gothic', 'Comedy', 'Drama']);
    expect(values.map(item => item.count)).toEqual([40, 0, 5]);
  });

  it('keeps row order stable while a value cycles states', () => {
    const served = [group('genre', 'Genre', [['Gothic', 40], ['Comedy', 30], ['Drama', 20]])];
    const base: BookFacetSelection = anyOf({genre: ['Comedy', 'Gothic']});
    const before = buildRailGroups(served, base, frozen)[0].values.map(item => item.value);

    const promoted = setFacetValueState(base, 'genre', 'Comedy', 'must');
    const after = buildRailGroups(served, promoted, frozen)[0].values.map(item => item.value);
    expect(after).toEqual(before);
  });

  it('excludes the sort registry from frozen vocabulary and rail groups', () => {
    const served = [
      group('sort', 'Sort', [['title', 0], ['-title', 0]], 'sort'),
      group('genre', 'Genre', [['Gothic', 1]]),
    ];
    const frozenHere = freezeFacetOrders(served);

    expect(Object.keys(frozenHere)).toEqual(['genre']);
    expect(orderedFacetVocabularyKeys(served, frozenHere)).toEqual(['genre']);
    expect(buildRailGroups(served, EMPTY_FACET_SELECTION, frozenHere).map(item => item.key))
      .toEqual(['genre']);
  });

  it('renders unknown served groups after preferred rail groups', () => {
    const served = [
      group('binding', 'Binding', [['Hardback', 2]]),
      group('genre', 'Genre', [['Gothic', 1]]),
      group('award', 'Award', [['Hugo', 1]]),
    ];

    expect(buildRailGroups(served, EMPTY_FACET_SELECTION).map(item => item.key))
      .toEqual(['genre', 'binding', 'award']);
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
      .toEqual(['author', 'publisher', 'binding', 'award']);
    expect(buildRailGroups(served, EMPTY_FACET_SELECTION, frozenHere).map(item => item.key))
      .toEqual(['author', 'publisher', 'binding', 'award']);
  });

  it('renders an explicitly served empty group with an empty frozen vocabulary', () => {
    const served = [group('binding', 'Binding', [])];
    const frozenHere = freezeFacetOrders(served);

    expect(buildRailGroups(served, EMPTY_FACET_SELECTION, frozenHere)).toEqual([{
      key: 'binding',
      label: 'Binding',
      defaultOpen: false,
      values: [],
    }]);
  });
});

describe('three-state selection model', () => {
  it('parses the three route params into their buckets', () => {
    const selection = parseBrowseFacetSelection(
      ['genre:Comedy', 'genre:Drama'],
      ['genre:History'],
      ['tag:Anthology'],
    );
    expect(selection).toEqual({
      any: {genre: ['Comedy', 'Drama']},
      must: {genre: ['History']},
      not: {tag: ['Anthology']},
    });
  });

  it('parses unknown facet keys and keeps the first-colon split', () => {
    const selection = parseBrowseFacetSelection(
      ['read_status:READ', 'future_group:a:b', 'future_group:a:b'],
      [],
      [],
    );

    expect(selection.any).toEqual({
      read_status: ['READ'],
      future_group: ['a:b'],
    });
  });

  it('treats prototype-named facet keys as ordinary keys', () => {
    const selection = parseBrowseFacetSelection(['__proto__:READ'], [], []);

    expect(Object.hasOwn(selection.any, '__proto__')).toBe(true);
    expect(selection.any['__proto__']).toEqual(['READ']);
    expect(buildRailGroups(
      [group('__proto__', 'Prototype', [['READ', 1]])],
      selection,
    )[0].values[0]).toMatchObject({value: 'READ', selected: true});
  });

  it('serializes buckets to router params, null for empty ones', () => {
    const selection: BookFacetSelection = {any: {genre: ['Comedy']}, must: {genre: ['History']}, not: {}};
    expect(browseFacetQueryParams(selection)).toEqual({
      facet: ['genre:Comedy'],
      facet_must: ['genre:History'],
      facet_not: null,
    });
  });

  it('round-trips a selection through params and back', () => {
    const selection = parseBrowseFacetSelection(['genre:Comedy'], ['genre:History'], ['tag:Anthology']);
    const params = browseFacetQueryParams(selection);
    expect(parseBrowseFacetSelection(params.facet ?? [], params.facet_must ?? [], params.facet_not ?? []))
      .toEqual(selection);
  });

  it('keeps a value in exactly one state', () => {
    let selection = setFacetValueState(EMPTY_FACET_SELECTION, 'genre', 'History', 'any');
    selection = setFacetValueState(selection, 'genre', 'History', 'must');
    expect(selection.any.genre).toBeUndefined();
    expect(selection.must.genre).toEqual(['History']);

    selection = setFacetValueState(selection, 'genre', 'History', 'not');
    expect(selection.must.genre).toBeUndefined();
    expect(selection.not.genre).toEqual(['History']);

    selection = setFacetValueState(selection, 'genre', 'History', null);
    expect(selection).toEqual(EMPTY_FACET_SELECTION);
  });

  it('reports a value state across buckets', () => {
    const selection: BookFacetSelection = {any: {genre: ['Comedy']}, must: {genre: ['History']}, not: {}};
    expect(facetValueState(selection, 'genre', 'Comedy')).toBe('any');
    expect(facetValueState(selection, 'genre', 'History')).toBe('must');
    expect(facetValueState(selection, 'genre', 'Drama')).toBeNull();
  });

  it('untick clears a value from every bucket, so chip removal works for all states', () => {
    const required: BookFacetSelection = {any: {}, must: {genre: ['History']}, not: {}};
    expect(toggleFacetSelection(required, 'genre', 'History', false)).toEqual(EMPTY_FACET_SELECTION);

    const excluded: BookFacetSelection = {any: {}, must: {}, not: {genre: ['History']}};
    expect(toggleFacetSelection(excluded, 'genre', 'History', false)).toEqual(EMPTY_FACET_SELECTION);
  });

  it('a plain tick replaces any prior state for the value', () => {
    const excluded: BookFacetSelection = {any: {}, must: {}, not: {genre: ['History']}};
    expect(toggleFacetSelection(excluded, 'genre', 'History', true)).toEqual({
      any: {genre: ['History']},
      must: {},
      not: {},
    });
  });

  it('cycles a value tick → require → exclude → clear', () => {
    let selection: BookFacetSelection = EMPTY_FACET_SELECTION;
    const states: (string | null)[] = [];
    for (let clicks = 0; clicks < 4; clicks++) {
      selection = cycleFacetValue(selection, 'genre', 'History');
      states.push(facetValueState(selection, 'genre', 'History'));
    }
    expect(states).toEqual(['any', 'must', 'not', null]);
    expect(selection).toEqual(EMPTY_FACET_SELECTION);
  });

  it('exposes each value state on the rail model', () => {
    const served = [group('genre', 'Genre', [['Comedy', 7], ['History', 3], ['Drama', 2], ['Farce', 1]])];
    const selection: BookFacetSelection = {
      any: {genre: ['Comedy']},
      must: {genre: ['History']},
      not: {genre: ['Drama']},
    };
    const values = buildRailGroups(served, selection)[0].values;
    expect(values.map(item => [item.value, item.state])).toEqual([
      ['Comedy', 'any'],
      ['History', 'must'],
      ['Drama', 'not'],
      ['Farce', null],
    ]);
  });

  it('counts selections across all buckets', () => {
    const selection: BookFacetSelection = {
      any: {genre: ['Comedy', 'Drama']},
      must: {genre: ['History']},
      not: {tag: ['Anthology']},
    };
    expect(countFacetSelections(selection)).toBe(4);
    expect(countFacetSelections(EMPTY_FACET_SELECTION)).toBe(0);
  });
});
