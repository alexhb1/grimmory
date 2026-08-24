import {
  LucideArrowDown10,
  LucideArrowDownZA,
  LucideArrowUp01,
  LucideArrowUpAZ,
  LucideCalendarArrowDown,
  LucideCalendarArrowUp,
  LucideClockArrowDown,
  LucideClockArrowUp,
  LucideShuffle,
  type LucideIconData,
} from '@lucide/angular';

import {type BrowseSortDirection, type BrowseSortTerm} from '../../../core/data/browse.models';

export type BrowseSortKind = 'alphabetical' | 'numeric' | 'calendar' | 'clock' | 'random';

export interface BrowseSortField {
  readonly labelKey: string;
  readonly group: 'common' | 'more';
  readonly defaultDirection: BrowseSortDirection;
  readonly kind: BrowseSortKind;
}

export interface BrowseSortOption<Key extends string = string> {
  readonly id: Key;
  readonly labelKey: string;
  readonly group: 'common' | 'more';
  readonly kind: BrowseSortKind;
  readonly defaultDirection: BrowseSortDirection;
  readonly directions: readonly BrowseSortDirection[];
}

export interface BrowseSortSelection<Key extends string = string> {
  readonly option: BrowseSortOption<Key>;
  readonly direction: BrowseSortDirection;
}

export interface BrowseSortVocabulary<Key extends string> {
  readonly order: readonly Key[];
  readonly field: (key: Key) => BrowseSortField;
  readonly parseToken: (token: string | null) => readonly BrowseSortTerm<Key>[];
}

export function browseSortOption<Key extends string>(
  key: Key,
  directions: readonly BrowseSortDirection[],
  vocabulary: BrowseSortVocabulary<Key>,
): BrowseSortOption<Key> {
  const field = vocabulary.field(key);
  return {
    id: key,
    labelKey: field.labelKey,
    group: field.group,
    kind: field.kind,
    defaultDirection: directions.includes(field.defaultDirection)
      ? field.defaultDirection
      : directions[0],
    directions,
  };
}

export function buildBrowseSortOptions<Key extends string>(
  serverSortTokens: readonly string[],
  vocabulary: BrowseSortVocabulary<Key>,
): BrowseSortOption<Key>[] {
  const directionsByKey = new Map<Key, BrowseSortDirection[]>();
  for (const token of serverSortTokens) {
    const term = vocabulary.parseToken(token)[0];
    if (!term) {
      continue;
    }
    const directions = directionsByKey.get(term.key) ?? [];
    directions.push(term.direction);
    directionsByKey.set(term.key, directions);
  }
  return vocabulary.order.flatMap(key => {
    const directions = directionsByKey.get(key);
    return directions ? [browseSortOption(key, directions, vocabulary)] : [];
  });
}

export function parseBrowseSortToken<Key extends string>(
  token: string | null,
  vocabulary: BrowseSortVocabulary<Key>,
): BrowseSortSelection<Key> | null {
  const first = vocabulary.parseToken(token)[0];
  return first
    ? {option: browseSortOption(first.key, [first.direction], vocabulary), direction: first.direction}
    : null;
}

export function browseSortTerms<Key extends string>(
  selection: BrowseSortSelection<Key>,
): BrowseSortTerm<Key>[] {
  return [{key: selection.option.id, direction: selection.direction}];
}

export function browseSortDirectionIcon(
  kind: BrowseSortKind,
  direction: BrowseSortDirection,
): LucideIconData {
  const ascending = direction === 'asc';

  switch (kind) {
    case 'alphabetical':
      return ascending ? LucideArrowUpAZ.icon : LucideArrowDownZA.icon;
    case 'numeric':
      return ascending ? LucideArrowUp01.icon : LucideArrowDown10.icon;
    case 'calendar':
      return ascending ? LucideCalendarArrowUp.icon : LucideCalendarArrowDown.icon;
    case 'clock':
      return ascending ? LucideClockArrowUp.icon : LucideClockArrowDown.icon;
    case 'random':
      return LucideShuffle.icon;
  }
}
