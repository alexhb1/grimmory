import {
  isBookQueryFacetKey,
  type BookQueryFacetKey,
  type FacetValueMap,
} from '../data/book-query-params';
import {type BookFacetGroup} from '../data/book-query.models';
import {type FilterRailGroup} from '../../../shared/components/browse/browse-filter-rail/browse-filter-rail.component';

export const RAIL_GROUP_ORDER: readonly BookQueryFacetKey[] = [
  'author', 'genre', 'tag', 'mood', 'series', 'publisher', 'language', 'file_type',
];
const RAIL_OPEN_BY_DEFAULT: ReadonlySet<BookQueryFacetKey> = new Set(['author', 'genre', 'tag', 'series']);
const RAIL_GROUP_ORDER_SET: ReadonlySet<BookQueryFacetKey> = new Set(RAIL_GROUP_ORDER);

export function parseFacetParams(tokens: readonly string[]): FacetValueMap {
  const facets = new Map<BookQueryFacetKey, string[]>();
  for (const token of tokens) {
    const separator = token.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (!isBookQueryFacetKey(key) || value === '') {
      continue;
    }
    const values = facets.get(key) ?? [];
    if (!values.includes(value)) {
      values.push(value);
      facets.set(key, values);
    }
  }
  return Object.fromEntries(facets);
}

export function facetParamTokens(facets: FacetValueMap): string[] {
  return Object.entries(facets).flatMap(([key, values]) =>
    (values ?? []).map(value => `${key}:${value}`),
  );
}

export function browseFacetQueryParams(facets: FacetValueMap): Record<'facet', string[] | null> {
  const tokens = facetParamTokens(facets);
  return {facet: tokens.length > 0 ? tokens : null};
}

export function toggleFacetSelection(
  current: FacetValueMap,
  key: string,
  value: string,
  selected: boolean,
): FacetValueMap {
  if (!isBookQueryFacetKey(key)) {
    return current;
  }
  const values = facetValuesForKey(current, key);
  if (selected === values.includes(value)) {
    return current;
  }
  const remaining = selected ? [...values, value] : values.filter(item => item !== value);
  const next: Partial<Record<BookQueryFacetKey, readonly string[]>> = {...current};
  if (remaining.length > 0) {
    next[key] = remaining;
  } else {
    delete next[key];
  }
  return next;
}

export function countFacetSelections(facets: FacetValueMap): number {
  return Object.values(facets).reduce((count, values) => count + (values?.length ?? 0), 0);
}

export function facetValuesForKey(facets: FacetValueMap, key: string): readonly string[] {
  return isBookQueryFacetKey(key) && Object.hasOwn(facets, key) ? facets[key] ?? [] : [];
}

export interface FrozenFacetValue {
  value: string;
  label: string;
}

export interface FrozenFacetGroup {
  title: string;
  values: FrozenFacetValue[];
}

export type FrozenFacetOrders = Readonly<Record<string, FrozenFacetGroup>>;

export function freezeFacetOrders(served: readonly BookFacetGroup[]): FrozenFacetOrders {
  return Object.fromEntries(
    served.filter(group => group.rel === 'facet' && isBookQueryFacetKey(group.key)).map(group => [group.key, {
      title: group.title,
      values: group.values.map(value => ({value: value.value, label: value.title})),
    }] as const),
  );
}

export function orderedFacetVocabularyKeys(
  served: readonly BookFacetGroup[],
  frozen?: FrozenFacetOrders,
): BookQueryFacetKey[] {
  const vocabularyKeys: BookQueryFacetKey[] = [];
  const seen = new Set<BookQueryFacetKey>();
  const append = (key: string): void => {
    if (isBookQueryFacetKey(key) && !seen.has(key)) {
      seen.add(key);
      vocabularyKeys.push(key);
    }
  };

  Object.keys(frozen ?? {}).forEach(append);
  served.filter(group => group.rel === 'facet').forEach(group => append(group.key));

  return [
    ...RAIL_GROUP_ORDER.filter(key => seen.has(key)),
    ...vocabularyKeys.filter(key => !RAIL_GROUP_ORDER_SET.has(key)),
  ];
}

export function buildRailGroups(
  served: readonly BookFacetGroup[],
  frozen?: FrozenFacetOrders,
): FilterRailGroup[] {
  const byKey = new Map(
    served
      .filter(group => group.rel === 'facet' && isBookQueryFacetKey(group.key))
      .map(group => [group.key, group]),
  );
  const groups: FilterRailGroup[] = [];
  for (const key of orderedFacetVocabularyKeys(served, frozen)) {
    const servedGroup = byKey.get(key);
    const frozenGroup = frozen && Object.hasOwn(frozen, key) ? frozen[key] : undefined;
    if (!frozenGroup) {
      if (!servedGroup) {
        continue;
      }
      groups.push({
        key,
        label: servedGroup.title,
        defaultOpen: RAIL_OPEN_BY_DEFAULT.has(key),
        values: servedGroup.values.map(value => ({
          value: value.value,
          label: value.title,
          count: value.count ?? null,
          selected: value.selected,
        })),
      });
      continue;
    }

    const counts = new Map((servedGroup?.values ?? []).map(value => [value.value, value.count ?? null]));
    const selected = new Set(
      (servedGroup?.values ?? []).filter(value => value.selected).map(value => value.value),
    );
    const known = new Set(frozenGroup.values.map(value => value.value));
    const values = frozenGroup.values.map(frozenValue => ({
      value: frozenValue.value,
      label: frozenValue.label,
      count: counts.has(frozenValue.value) ? counts.get(frozenValue.value) ?? null : 0,
      selected: selected.has(frozenValue.value),
    }));
    for (const value of servedGroup?.values ?? []) {
      if (!known.has(value.value)) {
        values.push({
          value: value.value,
          label: value.title,
          count: value.count ?? null,
          selected: value.selected,
        });
      }
    }
    const ordered = [
      ...values.filter(item => item.count !== 0 || item.selected),
      ...values.filter(item => item.count === 0 && !item.selected),
    ];
    if (servedGroup || values.length > 0) {
      groups.push({
        key,
        label: frozenGroup.title,
        defaultOpen: RAIL_OPEN_BY_DEFAULT.has(key),
        values: ordered,
      });
    }
  }
  return groups;
}
