import {convertToParamMap} from '@angular/router';
import {describe, expect, it} from 'vitest';

import {EMPTY_FACET_SELECTION} from '../data/book-query-params';
import {bookBrowseScope, scopedFacetSelection} from './book-browse-scope';

describe('bookBrowseScope', () => {
  it('maps each scoped route onto its stable facet', () => {
    expect(bookBrowseScope(convertToParamMap({libraryId: '3'}), {}))
      .toEqual({kind: 'library', entityId: 3, facetKey: 'library', facetValue: '3'});
    expect(bookBrowseScope(convertToParamMap({shelfId: '7'}), {}))
      .toEqual({kind: 'shelf', entityId: 7, facetKey: 'shelf', facetValue: '7'});
    expect(bookBrowseScope(convertToParamMap({magicShelfId: '9'}), {}))
      .toEqual({kind: 'magicShelf', entityId: 9, facetKey: 'shelf', facetValue: 'magic:9'});
    expect(bookBrowseScope(convertToParamMap({}), {browseScope: 'unshelved'}))
      .toEqual({kind: 'unshelved', facetKey: 'shelf_status', facetValue: 'unshelved'});
  });

  it('treats unscoped and malformed routes as all books', () => {
    expect(bookBrowseScope(convertToParamMap({}), {})).toBeNull();
    expect(bookBrowseScope(convertToParamMap({libraryId: 'abc'}), {})).toBeNull();
    expect(bookBrowseScope(convertToParamMap({libraryId: '-2'}), {})).toBeNull();
  });
});

describe('scopedFacetSelection', () => {
  it('passes selections through unchanged without a scope', () => {
    const selection = {any: {genre: ['Fantasy']}, must: {}, not: {}};
    expect(scopedFacetSelection(selection, null)).toBe(selection);
  });

  it('adds the scope facet and gives the scope sole ownership of its key', () => {
    const scope = bookBrowseScope(convertToParamMap({libraryId: '3'}), {});
    const selection = {
      any: {genre: ['Fantasy'], library: ['99']},
      must: {library: ['42']},
      not: {library: ['7'], tag: ['Abandoned']},
    };

    expect(scopedFacetSelection(selection, scope)).toEqual({
      any: {genre: ['Fantasy'], library: ['3']},
      must: {},
      not: {tag: ['Abandoned']},
    });
  });

  it('scopes an empty selection to exactly the scope facet', () => {
    const scope = bookBrowseScope(convertToParamMap({}), {browseScope: 'unshelved'});
    expect(scopedFacetSelection(EMPTY_FACET_SELECTION, scope)).toEqual({
      any: {shelf_status: ['unshelved']},
      must: {},
      not: {},
    });
  });
});
