import {computed, linkedSignal, type Signal} from '@angular/core';

export interface BrowseSelectionItem {
  readonly id: number;
}

export interface BrowseSelectionDeps {
  membershipIdentity: Signal<string>;
  orderingIdentity: Signal<string>;
  items: Signal<readonly BrowseSelectionItem[]>;
  totalElements: Signal<number | null>;
}

export type BrowseSelectionState =
  | {mode: 'explicit'; ids: ReadonlySet<number>}
  | {mode: 'allMatching'; excludedIds: ReadonlySet<number>};

export interface BrowseSelection {
  readonly state: Signal<BrowseSelectionState>;
  readonly count: Signal<number>;
  readonly active: Signal<boolean>;
  readonly allCurrentResultsSelected: Signal<boolean>;
  isSelected(id: number): boolean;
  toggle(item: BrowseSelectionItem, index: number, shiftKey: boolean): void;
  selectAll(): void;
  clear(): void;
  pruneDeleted(ids: readonly number[]): void;
}

export async function resolveSelectedIds(
  state: BrowseSelectionState,
  fetchIds: () => Promise<readonly number[]>,
): Promise<readonly number[]> {
  if (state.mode === 'explicit') {
    return [...state.ids];
  }
  const ids = await fetchIds();
  return state.excludedIds.size === 0
    ? ids
    : ids.filter(id => !state.excludedIds.has(id));
}

export function createBrowseSelection(deps: BrowseSelectionDeps): BrowseSelection {
  const state = linkedSignal<string, BrowseSelectionState>({
    source: deps.membershipIdentity,
    computation: () => ({mode: 'explicit', ids: new Set<number>()}),
  });
  const anchor = linkedSignal<string, number | null>({
    source: deps.orderingIdentity,
    computation: () => null,
  });

  const count = computed(() => {
    const current = state();
    return current.mode === 'explicit'
      ? current.ids.size
      : Math.max(0, (deps.totalElements() ?? 0) - current.excludedIds.size);
  });

  const active = computed(() => count() > 0);
  const allCurrentResultsSelected = computed(() => {
    const current = state();
    const total = deps.totalElements();
    return current.mode === 'allMatching'
      && current.excludedIds.size === 0
      && total !== null
      && total > 0;
  });

  function isSelected(id: number): boolean {
    const current = state();
    return current.mode === 'explicit'
      ? current.ids.has(id)
      : !current.excludedIds.has(id);
  }

  function selectLoadedRange(start: number, end: number, selected: boolean): void {
    const items = deps.items();
    const rangeIds: number[] = [];
    for (let index = start; index <= end; index++) {
      rangeIds.push(items[index]!.id);
    }
    const current = state();
    if (current.mode === 'explicit') {
      const ids = new Set(current.ids);
      for (const id of rangeIds) {
        if (selected) {
          ids.add(id);
        } else {
          ids.delete(id);
        }
      }
      state.set({mode: 'explicit', ids});
    } else {
      const excludedIds = new Set(current.excludedIds);
      for (const id of rangeIds) {
        if (selected) {
          excludedIds.delete(id);
        } else {
          excludedIds.add(id);
        }
      }
      state.set({mode: 'allMatching', excludedIds});
    }
  }

  function toggle(item: BrowseSelectionItem, index: number, shiftKey: boolean): void {
    const anchorId = anchor();
    if (shiftKey && anchorId !== null) {
      const anchorIndex = deps.items().findIndex(candidate => candidate.id === anchorId);
      if (anchorIndex >= 0) {
        selectLoadedRange(
          Math.min(anchorIndex, index),
          Math.max(anchorIndex, index),
          !isSelected(item.id),
        );
        return;
      }
    }

    const current = state();
    if (current.mode === 'explicit') {
      const ids = new Set(current.ids);
      if (ids.has(item.id)) {
        ids.delete(item.id);
      } else {
        ids.add(item.id);
      }
      state.set({mode: 'explicit', ids});
    } else if (current.excludedIds.has(item.id)) {
      const excludedIds = new Set(current.excludedIds);
      excludedIds.delete(item.id);
      state.set({mode: 'allMatching', excludedIds});
    } else {
      const excludedIds = new Set(current.excludedIds);
      excludedIds.add(item.id);
      state.set({mode: 'allMatching', excludedIds});
    }
    anchor.set(item.id);
  }

  function selectAll(): void {
    const total = deps.totalElements();
    if (total === null || total === 0) {
      return;
    }
    anchor.set(null);
    state.set({mode: 'allMatching', excludedIds: new Set<number>()});
  }

  function clear(): void {
    state.set({mode: 'explicit', ids: new Set<number>()});
    anchor.set(null);
  }

  function pruneDeleted(ids: readonly number[]): void {
    if (ids.length === 0) {
      return;
    }
    const current = state();
    if (current.mode === 'explicit') {
      const next = new Set(current.ids);
      for (const id of ids) {
        next.delete(id);
      }
      state.set({mode: 'explicit', ids: next});
    } else {
      const excludedIds = new Set(current.excludedIds);
      for (const id of ids) {
        excludedIds.delete(id);
      }
      state.set({mode: 'allMatching', excludedIds});
    }
  }

  return {
    state: state.asReadonly(),
    count,
    active,
    allCurrentResultsSelected,
    isSelected,
    toggle,
    selectAll,
    clear,
    pruneDeleted,
  };
}
