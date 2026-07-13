import {
  type BookFacetSelection,
  type FacetValueMap,
} from '../data/book-query-params';
import {type BookFacetGroup} from '../data/book-query.models';
import {type FilterRailGroup} from '../../../shared/components/browse/browse-filter-rail/browse-filter-rail.component';

export type BookFacetSelections = Partial<Record<string, string[]>>;

export type FacetValueState = 'any' | 'must' | 'not';

// Preferred groups lead; every other facet group follows in vocabulary order.
export const RAIL_GROUP_ORDER: readonly string[] = [
  'author', 'genre', 'tag', 'mood', 'series', 'publisher', 'language', 'file_type',
];
const RAIL_OPEN_BY_DEFAULT: ReadonlySet<string> = new Set(['author', 'genre', 'tag', 'series']);
const RAIL_GROUP_ORDER_SET: ReadonlySet<string> = new Set(RAIL_GROUP_ORDER);

export function parseFacetParams(tokens: readonly string[]): BookFacetSelections {
  const facets = new Map<string, string[]>();
  for (const token of tokens) {
    const separator = token.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (value === '') {
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

export function parseBrowseFacetSelection(
  facetTokens: readonly string[],
  mustTokens: readonly string[],
  notTokens: readonly string[],
): BookFacetSelection {
  return {
    any: parseFacetParams(facetTokens),
    must: parseFacetParams(mustTokens),
    not: parseFacetParams(notTokens),
  };
}

export function facetParamTokens(facets: FacetValueMap): string[] {
  return Object.entries(facets).flatMap(([key, values]) =>
    (values ?? []).map(value => `${key}:${value}`),
  );
}

export function browseFacetQueryParams(
  selection: BookFacetSelection,
): Record<'facet' | 'facet_must' | 'facet_not', string[] | null> {
  const tokensOrNull = (bucket: FacetValueMap): string[] | null => {
    const tokens = facetParamTokens(bucket);
    return tokens.length > 0 ? tokens : null;
  };
  return {
    facet: tokensOrNull(selection.any),
    facet_must: tokensOrNull(selection.must),
    facet_not: tokensOrNull(selection.not),
  };
}

export function facetValueState(
  selection: BookFacetSelection,
  key: string,
  value: string,
): FacetValueState | null {
  if (facetValuesForKey(selection.any, key).includes(value)) {
    return 'any';
  }
  if (facetValuesForKey(selection.must, key).includes(value)) {
    return 'must';
  }
  if (facetValuesForKey(selection.not, key).includes(value)) {
    return 'not';
  }
  return null;
}

export function setFacetValueState(
  selection: BookFacetSelection,
  key: string,
  value: string,
  state: FacetValueState | null,
): BookFacetSelection {
  const without = (bucket: FacetValueMap): FacetValueMap => {
    const values = facetValuesForKey(bucket, key);
    if (!values?.includes(value)) {
      return bucket;
    }
    const remaining = values.filter(item => item !== value);
    const next: Partial<Record<string, readonly string[]>> = {...bucket};
    if (remaining.length > 0) {
      next[key] = remaining;
    } else {
      delete next[key];
    }
    return next;
  };
  const withValue = (bucket: FacetValueMap): FacetValueMap =>
    ({...bucket, [key]: [...facetValuesForKey(bucket, key), value]});

  const cleared: BookFacetSelection = {
    any: without(selection.any),
    must: without(selection.must),
    not: without(selection.not),
  };
  switch (state) {
    case null:
      return cleared;
    case 'any':
      return {...cleared, any: withValue(cleared.any)};
    case 'must':
      return {...cleared, must: withValue(cleared.must)};
    case 'not':
      return {...cleared, not: withValue(cleared.not)};
  }
}

export function toggleFacetSelection(
  current: BookFacetSelection,
  key: string,
  value: string,
  selected: boolean,
): BookFacetSelection {
  return setFacetValueState(current, key, value, selected ? 'any' : null);
}

export function nextFacetValueState(state: FacetValueState | null): FacetValueState | null {
  switch (state) {
    case null:
      return 'any';
    case 'any':
      return 'must';
    case 'must':
      return 'not';
    case 'not':
      return null;
  }
}

export function cycleFacetValue(
  selection: BookFacetSelection,
  key: string,
  value: string,
): BookFacetSelection {
  return setFacetValueState(selection, key, value,
    nextFacetValueState(facetValueState(selection, key, value)));
}

export function countFacetSelections(selection: BookFacetSelection): number {
  return [selection.any, selection.must, selection.not].reduce(
    (total, bucket) =>
      total + Object.values(bucket).reduce((count, values) => count + (values?.length ?? 0), 0),
    0,
  );
}

export function facetValuesForKey(facets: FacetValueMap, key: string): readonly string[] {
  return Object.hasOwn(facets, key) ? facets[key] ?? [] : [];
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
    served.filter(group => group.rel === 'facet').map(group => [group.key, {
      title: group.title,
      values: group.values.map(value => ({value: value.value, label: value.title})),
    }] as const),
  );
}

export function mustFacetKeys(selection: BookFacetSelection): ReadonlySet<string> {
  return new Set(Object.keys(selection.must).filter(key =>
    facetValuesForKey(selection.must, key).length > 0));
}

export function orderedFacetVocabularyKeys(
  served: readonly BookFacetGroup[],
  frozen?: FrozenFacetOrders,
): string[] {
  const vocabularyKeys: string[] = [];
  const seen = new Set<string>();
  const append = (key: string): void => {
    if (!seen.has(key)) {
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
  selections: BookFacetSelection,
  frozen?: FrozenFacetOrders,
  mustOrderedKeys: ReadonlySet<string> = mustFacetKeys(selections),
): FilterRailGroup[] {
  const byKey = new Map(
    served.filter(group => group.rel === 'facet').map(group => [group.key, group]),
  );
  const groups: FilterRailGroup[] = [];
  for (const key of orderedFacetVocabularyKeys(served, frozen)) {
    const servedGroup = byKey.get(key);
    const frozenGroup = frozen && Object.hasOwn(frozen, key) ? frozen[key] : undefined;
    const anySet = new Set(facetValuesForKey(selections.any, key));
    const mustSet = new Set(facetValuesForKey(selections.must, key));
    const notSet = new Set(facetValuesForKey(selections.not, key));
    const stateOf = (value: string): FacetValueState | null =>
      mustSet.has(value) ? 'must' : notSet.has(value) ? 'not' : anySet.has(value) ? 'any' : null;
    const isSelected = (value: string): boolean => stateOf(value) !== null;

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
          selected: isSelected(value.value),
          state: stateOf(value.value),
        })),
      });
      continue;
    }

    const counts = new Map((servedGroup?.values ?? []).map(value => [value.value, value.count ?? null]));
    const known = new Set(frozenGroup.values.map(value => value.value));
    const values = frozenGroup.values.map(frozenValue => ({
      value: frozenValue.value,
      label: frozenValue.label,
      count: counts.has(frozenValue.value) ? counts.get(frozenValue.value) ?? null : 0,
      selected: isSelected(frozenValue.value),
      state: stateOf(frozenValue.value),
    }));
    for (const value of servedGroup?.values ?? []) {
      if (!known.has(value.value)) {
        values.push({
          value: value.value,
          label: value.title,
          count: value.count ?? null,
          selected: isSelected(value.value),
          state: stateOf(value.value),
        });
      }
    }
    const ordered = mustOrderedKeys.has(key)
      ? values
      : [
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
