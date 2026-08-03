import {computed, linkedSignal, type Signal} from '@angular/core';

import {type BookSummary} from '../data/book-response.models';

export interface BookBrowseSelectionDeps {
  membershipIdentity: Signal<string>;
  orderingIdentity: Signal<string>;
  books: Signal<readonly BookSummary[]>;
  totalElements: Signal<number | null>;
}

export type BookSelectionState =
  | {mode: 'explicit'; ids: ReadonlySet<number>}
  | {mode: 'allMatching'; excludedIds: ReadonlySet<number>};

export interface BookBrowseSelection {
  readonly state: Signal<BookSelectionState>;
  readonly count: Signal<number>;
  readonly active: Signal<boolean>;
  readonly allCurrentResultsSelected: Signal<boolean>;
  isSelected(id: number): boolean;
  toggle(book: BookSummary, index: number, shiftKey: boolean): void;
  selectAll(): void;
  clear(): void;
  pruneDeleted(ids: readonly number[]): void;
}

export async function resolveSelectedBookIds(
  state: BookSelectionState,
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

export function createBookBrowseSelection(deps: BookBrowseSelectionDeps): BookBrowseSelection {
  const state = linkedSignal<string, BookSelectionState>({
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

  function selectLoadedRange(start: number, end: number): void {
    const books = deps.books();
    const rangeIds: number[] = [];
    for (let index = start; index <= end; index++) {
      rangeIds.push(books[index]!.id);
    }
    const current = state();
    if (current.mode === 'explicit') {
      const ids = new Set(current.ids);
      for (const id of rangeIds) {
        ids.add(id);
      }
      state.set({mode: 'explicit', ids});
    } else {
      const excludedIds = new Set(current.excludedIds);
      for (const id of rangeIds) {
        excludedIds.delete(id);
      }
      state.set({mode: 'allMatching', excludedIds});
    }
  }

  function toggle(book: BookSummary, index: number, shiftKey: boolean): void {
    const anchorId = anchor();
    if (shiftKey && anchorId !== null) {
      const anchorIndex = deps.books().findIndex(candidate => candidate.id === anchorId);
      if (anchorIndex >= 0) {
        selectLoadedRange(Math.min(anchorIndex, index), Math.max(anchorIndex, index));
        return;
      }
    }

    const current = state();
    if (current.mode === 'explicit') {
      const ids = new Set(current.ids);
      if (ids.has(book.id)) {
        ids.delete(book.id);
      } else {
        ids.add(book.id);
      }
      state.set({mode: 'explicit', ids});
    } else if (current.excludedIds.has(book.id)) {
      const excludedIds = new Set(current.excludedIds);
      excludedIds.delete(book.id);
      state.set({mode: 'allMatching', excludedIds});
    } else {
      const excludedIds = new Set(current.excludedIds);
      excludedIds.add(book.id);
      if (Math.max(0, (deps.totalElements() ?? 0) - excludedIds.size) === 0) {
        state.set({mode: 'explicit', ids: new Set<number>()});
      } else {
        state.set({mode: 'allMatching', excludedIds});
      }
    }
    anchor.set(book.id);
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
