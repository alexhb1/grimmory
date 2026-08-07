import {type ParamMap} from '@angular/router';

import {type BookQueryFacetKey, type FacetValueMap} from '../data/book-query-params';

export type BookBrowseScope =
  | {kind: 'library'; entityId: number; facetKey: 'library'; facetValue: string}
  | {kind: 'shelf'; entityId: number; facetKey: 'shelf'; facetValue: string}
  | {kind: 'magicShelf'; entityId: number; facetKey: 'shelf'; facetValue: string}
  | {kind: 'unshelved'; facetKey: 'shelf_status'; facetValue: 'unshelved'};

export interface BookBrowseRouteData {
  browseScope?: 'unshelved';
}

export function bookBrowseScope(
  paramMap: ParamMap,
  routeData: BookBrowseRouteData,
): BookBrowseScope | null {
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
  selection: FacetValueMap,
  scope: BookBrowseScope | null,
): FacetValueMap {
  if (!scope) {
    return selection;
  }
  return {...omitKey(selection, scope.facetKey), [scope.facetKey]: [scope.facetValue]};
}

export function bookBrowseScopeTitle(
  scope: BookBrowseScope | null,
  libraries: readonly {id?: number | null; name: string}[],
  shelves: readonly {id?: number | null; name: string}[],
  magicShelves: readonly {id?: number | null; name: string}[],
  unshelvedLabel: string,
): string | null {
  switch (scope?.kind) {
    case 'library':
      return libraries.find(library => library.id === scope.entityId)?.name ?? null;
    case 'shelf':
      return shelves.find(shelf => shelf.id === scope.entityId)?.name ?? null;
    case 'magicShelf':
      return magicShelves.find(shelf => shelf.id === scope.entityId)?.name ?? null;
    case 'unshelved':
      return unshelvedLabel;
    case undefined:
      return null;
  }
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
