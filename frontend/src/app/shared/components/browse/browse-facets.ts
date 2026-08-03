import {type BrowseFacetGroup} from '../../../core/data/browse.models';
import {type FilterRailGroup} from './browse-filter-rail/browse-filter-rail.component';

interface FrozenFacetValue {
  readonly value: string;
  readonly label: string;
}

interface FrozenFacetGroup {
  readonly values: readonly FrozenFacetValue[];
}

export type FrozenFacetOrders = Readonly<Record<string, FrozenFacetGroup>>;

export type BrowseFacetSelection<K extends string = string> =
  Readonly<Partial<Record<K, readonly string[]>>>;

export interface BrowseFacetVocabulary<K extends string> {
  readonly order: readonly K[];
  readonly isKey: (key: string) => key is K;
  readonly labelKey: (key: K) => string;
  readonly openByDefault: ReadonlySet<K>;
}

export function freezeBrowseFacetOrders<K extends string>(
  served: readonly BrowseFacetGroup[],
  vocabulary: BrowseFacetVocabulary<K>,
): FrozenFacetOrders {
  return Object.fromEntries(
    served
      .filter(group => vocabulary.isKey(group.key))
      .map(group => [group.key, {
        values: group.values.map(value => ({value: value.value, label: value.title})),
      }] as const),
  );
}

export function orderedBrowseFacetVocabularyKeys<K extends string>(
  served: readonly BrowseFacetGroup[],
  frozen: FrozenFacetOrders | undefined,
  vocabulary: BrowseFacetVocabulary<K>,
): K[] {
  const available = new Set<string>(Object.keys(frozen ?? {}));
  served.forEach(group => available.add(group.key));
  return vocabulary.order.filter(key => available.has(key));
}

export function buildBrowseRailGroups<K extends string>(
  served: readonly BrowseFacetGroup[],
  frozen: FrozenFacetOrders | undefined,
  vocabulary: BrowseFacetVocabulary<K>,
): FilterRailGroup<K>[] {
  const byKey = new Map(
    served
      .filter(group => vocabulary.isKey(group.key))
      .map(group => [group.key, group]),
  );
  const groups: FilterRailGroup<K>[] = [];
  for (const key of orderedBrowseFacetVocabularyKeys(served, frozen, vocabulary)) {
    const servedGroup = byKey.get(key);
    const frozenGroup = frozen && Object.hasOwn(frozen, key) ? frozen[key] : undefined;
    const labelKey = vocabulary.labelKey(key);
    if (!frozenGroup) {
      if (!servedGroup) {
        continue;
      }
      groups.push({
        key,
        labelKey,
        defaultOpen: vocabulary.openByDefault.has(key),
        values: servedGroup.values.map(value => ({
          value: value.value,
          label: value.title,
          count: value.count,
          selected: value.selected,
        })),
      });
      continue;
    }

    const counts = new Map((servedGroup?.values ?? []).map(value => [value.value, value.count]));
    const selected = new Set(
      (servedGroup?.values ?? []).filter(value => value.selected).map(value => value.value),
    );
    const known = new Set(frozenGroup.values.map(value => value.value));
    const values = frozenGroup.values.map(frozenValue => ({
      value: frozenValue.value,
      label: frozenValue.label,
      count: counts.get(frozenValue.value) ?? 0,
      selected: selected.has(frozenValue.value),
    }));
    for (const value of servedGroup?.values ?? []) {
      if (!known.has(value.value)) {
        values.push({
          value: value.value,
          label: value.title,
          count: value.count,
          selected: value.selected,
        });
      }
    }
    const ordered = [
      ...values.filter(item => item.count !== 0 || item.selected),
      ...values.filter(item => item.count === 0 && !item.selected),
    ];
    groups.push({
      key,
      labelKey,
      defaultOpen: vocabulary.openByDefault.has(key),
      values: ordered,
    });
  }
  return groups;
}

export function pinBrowseFacetValue<K extends string>(
  selection: BrowseFacetSelection<K>,
  key: K,
  value: string,
): BrowseFacetSelection<K> {
  if (Object.hasOwn(selection, key)) {
    const rest = {...selection};
    delete rest[key];
    return {...rest, [key]: [value]};
  }
  return {...selection, [key]: [value]};
}
