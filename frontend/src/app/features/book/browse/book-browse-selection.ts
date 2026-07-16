import {computed, linkedSignal, type Signal} from '@angular/core';

import {type BookSummary} from '../data/book-response.models';

export interface BookBrowseSelectionDeps {
  membershipIdentity: Signal<string>;
  orderingIdentity: Signal<string>;
  books: Signal<readonly BookSummary[]>;
  totalElements: Signal<number | null>;
  fetchIds: () => Promise<readonly number[]>;
}

interface PendingState {
  exclusions: ReadonlySet<number>;
  promise: Promise<void>;
}

export interface BookBrowseSelection {
  readonly selectedIds: Signal<ReadonlySet<number>>;
  readonly count: Signal<number>;
  readonly active: Signal<boolean>;
  readonly allCurrentResultsSelected: Signal<boolean>;
  readonly idsError: Signal<boolean>;
  isSelected(id: number): boolean;
  toggle(book: BookSummary, index: number, shiftKey: boolean): void;
  selectAll(): void;
  clear(): void;
  pruneDeleted(ids: readonly number[]): void;
  retryIds(): void;
  resolvedIds(): Promise<readonly number[]>;
}

export function createBookBrowseSelection(deps: BookBrowseSelectionDeps): BookBrowseSelection {
  const explicit = linkedSignal<string, ReadonlySet<number>>({
    source: deps.membershipIdentity,
    computation: () => new Set<number>(),
  });
  const anchor = linkedSignal<string, number | null>({
    source: deps.orderingIdentity,
    computation: () => null,
  });
  const pending = linkedSignal<string, PendingState | null>({
    source: deps.membershipIdentity,
    computation: () => null,
  });
  const idsError = linkedSignal({
    source: deps.membershipIdentity,
    computation: () => false,
  });
  const allCurrentResults = linkedSignal({
    source: deps.membershipIdentity,
    computation: () => false,
  });

  const count = computed(() => {
    const size = explicit().size;
    const current = pending();
    return current
      ? Math.max(size, (deps.totalElements() ?? size) - current.exclusions.size)
      : size;
  });

  const active = computed(() => count() > 0);
  const allCurrentResultsSelected = computed(() => {
    const total = deps.totalElements();
    return total !== null
      && total > 0
      && allCurrentResults()
      && count() === total;
  });

  function isSelected(id: number): boolean {
    if (explicit().has(id)) {
      return true;
    }
    const current = pending();
    return current !== null && !current.exclusions.has(id);
  }

  function startMaterialisation(): void {
    const membershipIdentity = deps.membershipIdentity();
    const promise = deps.fetchIds().then(
      ids => {
        const current = pending();
        if (current === null
          || current.promise !== promise
          || deps.membershipIdentity() !== membershipIdentity) {
          return;
        }
        const next = new Set(explicit());
        for (const id of ids) {
          if (!current.exclusions.has(id)) {
            next.add(id);
          }
        }
        explicit.set(next);
        pending.set(null);
        idsError.set(false);
      },
      () => {
        const current = pending();
        if (current === null
          || current.promise !== promise
          || deps.membershipIdentity() !== membershipIdentity) {
          return;
        }
        pending.set(null);
        allCurrentResults.set(false);
        idsError.set(true);
      },
    ).then(() => undefined);

    pending.set({exclusions: new Set(), promise});
    idsError.set(false);
  }

  function selectLoadedRange(start: number, end: number): void {
    allCurrentResults.set(false);
    const books = deps.books();
    const next = new Set(explicit());
    for (let index = start; index <= end; index++) {
      const book = books[index];
      if (book) {
        next.add(book.id);
      }
    }
    explicit.set(next);
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

    const selected = isSelected(book.id);
    allCurrentResults.set(false);
    const next = new Set(explicit());
    const current = pending();
    if (selected) {
      next.delete(book.id);
      if (current !== null && !current.exclusions.has(book.id)) {
        const exclusions = new Set(current.exclusions);
        exclusions.add(book.id);
        pending.set({...current, exclusions});
      }
    } else if (current !== null && current.exclusions.has(book.id)) {
      const exclusions = new Set(current.exclusions);
      exclusions.delete(book.id);
      pending.set({...current, exclusions});
    } else {
      next.add(book.id);
    }
    explicit.set(next);
    anchor.set(book.id);
  }

  function selectAll(): void {
    anchor.set(null);
    allCurrentResults.set(true);
    startMaterialisation();
  }

  function clear(): void {
    explicit.set(new Set());
    anchor.set(null);
    pending.set(null);
    idsError.set(false);
    allCurrentResults.set(false);
  }

  function pruneDeleted(ids: readonly number[]): void {
    if (ids.length === 0) {
      return;
    }
    const next = new Set(explicit());
    for (const id of ids) {
      next.delete(id);
    }
    explicit.set(next);
  }

  function retryIds(): void {
    if (!idsError()) {
      return;
    }
    allCurrentResults.set(true);
    startMaterialisation();
  }

  async function resolvedIds(): Promise<readonly number[]> {
    const current = pending();
    if (current !== null) {
      await current.promise;
    }
    if (idsError()) {
      throw new Error('Selection ids are unavailable.');
    }
    return [...explicit()];
  }

  return {
    selectedIds: explicit.asReadonly(),
    count,
    active,
    allCurrentResultsSelected,
    idsError,
    isSelected,
    toggle,
    selectAll,
    clear,
    pruneDeleted,
    retryIds,
    resolvedIds,
  };
}
