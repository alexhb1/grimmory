import {type Data, type ParamMap} from '@angular/router';

import {
  type BookFacetSelection,
  type BookQueryFacetKey,
  type FacetValueMap,
} from '../data/book-query-params';

export type BookBrowseScope =
  | {kind: 'library'; entityId: number; facetKey: 'library'; facetValue: string}
  | {kind: 'shelf'; entityId: number; facetKey: 'shelf'; facetValue: string}
  | {kind: 'magicShelf'; entityId: number; facetKey: 'shelf'; facetValue: string}
  | {kind: 'unshelved'; facetKey: 'shelf_status'; facetValue: 'unshelved'};

export function bookBrowseScope(paramMap: ParamMap, routeData: Data): BookBrowseScope | null {
  const libraryId = positiveId(paramMap.get('libraryId'));
  if (libraryId !== null) {
    return {kind: 'library', entityId: libraryId, facetKey: 'library', facetValue: `${libraryId}`};
  }

  const shelfId = positiveId(paramMap.get('shelfId'));
  if (shelfId !== null) {
    return {kind: 'shelf', entityId: shelfId, facetKey: 'shelf', facetValue: `${shelfId}`};
  }

  const magicShelfId = positiveId(paramMap.get('magicShelfId'));
  if (magicShelfId !== null) {
    return {
      kind: 'magicShelf',
      entityId: magicShelfId,
      facetKey: 'shelf',
      facetValue: `magic:${magicShelfId}`,
    };
  }

  if (routeData['browseScope'] === 'unshelved') {
    return {kind: 'unshelved', facetKey: 'shelf_status', facetValue: 'unshelved'};
  }

  return null;
}

export function scopedFacetSelection(
  selection: BookFacetSelection,
  scope: BookBrowseScope | null,
): BookFacetSelection {
  if (!scope) {
    return selection;
  }
  return {
    any: {...omitKey(selection.any, scope.facetKey), [scope.facetKey]: [scope.facetValue]},
    must: omitKey(selection.must, scope.facetKey),
    not: omitKey(selection.not, scope.facetKey),
  };
}

function positiveId(raw: string | null): number | null {
  const id = Number(raw);
  return raw !== null && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function omitKey(facets: FacetValueMap, key: BookQueryFacetKey): FacetValueMap {
  if (!Object.hasOwn(facets, key)) {
    return facets;
  }
  const rest = {...facets};
  delete rest[key];
  return rest;
}
