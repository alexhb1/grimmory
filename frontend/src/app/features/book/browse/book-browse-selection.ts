import {computed, signal, type Signal} from '@angular/core';

import {type BookSummary} from '../data/book-response.models';


export interface BookBrowseSelectionDeps {
  paramsKey: Signal<string>;
  books: Signal<readonly (BookSummary | undefined)[]>;
  totalElements: Signal<number | null>;
  fetchIds: () => Promise<readonly number[]>;
}

type PendingSlice = {kind: 'all'} | {kind: 'range'; start: number; end: number};

interface PendingState {
  paramsKey: string;
  slice: PendingSlice;
  extraCount: number;
  exclusions: ReadonlySet<number>;
  promise: Promise<void>;
}

interface AnchorState {
  paramsKey: string;
  id: number;
  index: number;
}

export interface BookBrowseSelection {
  readonly selectedIds: Signal<ReadonlySet<number>>;
  readonly count: Signal<number>;
  readonly active: Signal<boolean>;
  readonly allCurrentResultsSelected: Signal<boolean>;
  readonly idsError: Signal<boolean>;
  isSelected(id: number, index: number): boolean;
  toggle(book: BookSummary, index: number, shiftKey: boolean): void;
  selectAll(): void;
  clear(): void;
  pruneDeleted(ids: readonly number[]): void;
  retryIds(): void;
  resolvedIds(): Promise<readonly number[]>;
}

export function createBookBrowseSelection(deps: BookBrowseSelectionDeps): BookBrowseSelection {
  const explicit = signal<ReadonlySet<number>>(new Set());
  const anchorState = signal<AnchorState | null>(null);
  const pendingState = signal<PendingState | null>(null);
  const failedSlice = signal<{paramsKey: string; slice: PendingSlice} | null>(null);
  const allScopeParamsKey = signal<string | null>(null);

  const anchor = computed(() => {
    const state = anchorState();
    return state && state.paramsKey === deps.paramsKey() ? state : null;
  });
  const pending = computed(() => {
    const state = pendingState();
    return state && state.paramsKey === deps.paramsKey() ? state : null;
  });
  const idsError = computed(() => {
    const state = failedSlice();
    return state !== null && state.paramsKey === deps.paramsKey();
  });

  const count = computed(() => {
    const size = explicit().size;
    const pend = pending();
    if (!pend) {
      return size;
    }
    if (pend.slice.kind === 'all') {
      return Math.max(size, (deps.totalElements() ?? size) - pend.exclusions.size);
    }
    return size + pend.extraCount;
  });

  const active = computed(() => count() > 0);
  const allCurrentResultsSelected = computed(() => {
    const total = deps.totalElements();
    return total !== null
      && total > 0
      && allScopeParamsKey() === deps.paramsKey()
      && count() === total;
  });

  function sliceCovers(slice: PendingSlice, index: number): boolean {
    return slice.kind === 'all' || (index >= slice.start && index <= slice.end);
  }

  function isSelected(id: number, index: number): boolean {
    if (explicit().has(id)) {
      return true;
    }
    const pend = pending();
    return pend !== null && sliceCovers(pend.slice, index) && !pend.exclusions.has(id);
  }

  function startMaterialisation(slice: PendingSlice, extraCount: number): void {
    const paramsKey = deps.paramsKey();
    const promise = deps.fetchIds().then(
      ids => {
        const current = pendingState();
        if (current === null || current.promise !== promise || deps.paramsKey() !== paramsKey) {
          return;
        }
        const sliceIds = current.slice.kind === 'all'
          ? ids
          : ids.slice(current.slice.start, current.slice.end + 1);
        const next = new Set(explicit());
        for (const id of sliceIds) {
          if (!current.exclusions.has(id)) {
            next.add(id);
          }
        }
        explicit.set(next);
        pendingState.set(null);
        failedSlice.set(null);
      },
      () => {
        const current = pendingState();
        if (current === null || current.promise !== promise || deps.paramsKey() !== paramsKey) {
          return;
        }
        pendingState.set(null);
        if (current.slice.kind === 'all') {
          allScopeParamsKey.set(null);
        }
        failedSlice.set({paramsKey, slice: current.slice});
      },
    ).then(() => undefined);

    pendingState.set({paramsKey, slice, extraCount, exclusions: new Set(), promise});
    failedSlice.set(null);
  }

  function rangeExtraCount(start: number, end: number): number {
    const books = deps.books();
    const selected = explicit();
    let extra = 0;
    for (let index = start; index <= end; index++) {
      const book = books[index];
      if (!book || !selected.has(book.id)) {
        extra++;
      }
    }
    return extra;
  }

  function selectRange(start: number, end: number): void {
    allScopeParamsKey.set(null);
    const books = deps.books();
    const loadedIds: number[] = [];
    let unloadedCount = 0;
    for (let index = start; index <= end; index++) {
      const book = books[index];
      if (book) {
        loadedIds.push(book.id);
      } else {
        unloadedCount++;
      }
    }

    if (loadedIds.length > 0) {
      const next = new Set(explicit());
      for (const id of loadedIds) {
        next.add(id);
      }
      explicit.set(next);
    }
    if (unloadedCount > 0) {
      startMaterialisation({kind: 'range', start, end}, unloadedCount);
    }
  }

  function toggle(book: BookSummary, index: number, shiftKey: boolean): void {
    const currentAnchor = anchor();
    if (shiftKey && currentAnchor !== null) {
      selectRange(Math.min(currentAnchor.index, index), Math.max(currentAnchor.index, index));
      return;
    }

    const selected = isSelected(book.id, index);
    allScopeParamsKey.set(null);
    const next = new Set(explicit());
    if (selected) {
      next.delete(book.id);
      const pend = pending();
      if (pend !== null && sliceCovers(pend.slice, index) && !pend.exclusions.has(book.id)) {
        const exclusions = new Set(pend.exclusions);
        exclusions.add(book.id);
        pendingState.set({
          ...pend,
          exclusions,
          extraCount: explicit().has(book.id) ? pend.extraCount : Math.max(0, pend.extraCount - 1),
        });
      }
    } else {
      next.add(book.id);
    }
    explicit.set(next);
    anchorState.set({paramsKey: deps.paramsKey(), id: book.id, index});
  }

  function selectAll(): void {
    anchorState.set(null);
    allScopeParamsKey.set(deps.paramsKey());
    startMaterialisation({kind: 'all'}, 0);
  }

  function clear(): void {
    explicit.set(new Set());
    anchorState.set(null);
    pendingState.set(null);
    failedSlice.set(null);
    allScopeParamsKey.set(null);
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
    const failed = failedSlice();
    if (failed === null || failed.paramsKey !== deps.paramsKey()) {
      return;
    }
    const extra = failed.slice.kind === 'range'
      ? rangeExtraCount(failed.slice.start, failed.slice.end)
      : 0;
    startMaterialisation(failed.slice, extra);
  }

  async function resolvedIds(): Promise<readonly number[]> {
    const pend = pending();
    if (pend !== null) {
      await pend.promise;
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
