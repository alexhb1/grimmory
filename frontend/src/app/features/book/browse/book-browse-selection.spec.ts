import {signal, type WritableSignal} from '@angular/core';
import {describe, expect, it, vi} from 'vitest';

import {type BookSummary} from '../data/book-response.models';
import {createBookBrowseSelection, type BookBrowseSelection} from './book-browse-selection';

function summary(id: number): BookSummary {
  return {id} as BookSummary;
}

function sparseBooks(total: number, loaded: readonly [number, number][]): readonly (BookSummary | undefined)[] {
  const books = new Array<BookSummary | undefined>(total);
  for (const [start, end] of loaded) {
    for (let index = start; index <= end; index++) {
      books[index] = summary(index + 1);
    }
  }
  return books;
}

interface Harness {
  selection: BookBrowseSelection;
  paramsKey: WritableSignal<string>;
  books: WritableSignal<readonly (BookSummary | undefined)[]>;
  totalElements: WritableSignal<number | null>;
  fetchIds: ReturnType<typeof vi.fn>;
  resolveIds: (ids: readonly number[]) => Promise<void>;
  rejectIds: () => Promise<void>;
}

function harness(total: number, loaded: readonly [number, number][]): Harness {
  const paramsKey = signal('params-a');
  const books = signal(sparseBooks(total, loaded));
  const totalElements = signal<number | null>(total);
  let resolve: (ids: readonly number[]) => void;
  let reject: (error: unknown) => void;
  const fetchIds = vi.fn(() => new Promise<readonly number[]>((res, rej) => {
    resolve = res;
    reject = rej;
  }));

  const selection = createBookBrowseSelection({paramsKey, books, totalElements, fetchIds});
  const settle = () => new Promise<void>(done => setTimeout(done, 0));

  return {
    selection,
    paramsKey,
    books,
    totalElements,
    fetchIds,
    resolveIds: ids => {
      resolve(ids);
      return settle();
    },
    rejectIds: () => {
      reject(new Error('ids failed'));
      return settle();
    },
  };
}

const allIds = (total: number) => Array.from({length: total}, (_, index) => index + 1);

describe('plain toggling', () => {
  it('selects and deselects by id and moves the anchor', () => {
    const {selection, books} = harness(10, [[0, 9]]);
    const book = books()[2]!;

    selection.toggle(book, 2, false);
    expect(selection.isSelected(book.id, 2)).toBe(true);
    expect(selection.count()).toBe(1);
    expect(selection.active()).toBe(true);

    selection.toggle(book, 2, false);
    expect(selection.isSelected(book.id, 2)).toBe(false);
    expect(selection.count()).toBe(0);
    expect(selection.active()).toBe(false);
  });

  it('treats shift with no anchor as a plain toggle', () => {
    const {selection, books} = harness(10, [[0, 9]]);
    selection.toggle(books()[4]!, 4, true);
    expect(selection.count()).toBe(1);
    expect(selection.isSelected(5, 4)).toBe(true);
  });
});

describe('shift ranges over loaded rows', () => {
  it('selects the inclusive anchor→target range without fetching ids', () => {
    const {selection, books, fetchIds} = harness(10, [[0, 9]]);
    selection.toggle(books()[2]!, 2, false);
    selection.toggle(books()[6]!, 6, true);

    for (let index = 2; index <= 6; index++) {
      expect(selection.isSelected(index + 1, index)).toBe(true);
    }
    expect(selection.count()).toBe(5);
    expect(fetchIds).not.toHaveBeenCalled();
  });

  it('selects ranges upward from the anchor and never deselects', () => {
    const {selection, books} = harness(10, [[0, 9]]);
    selection.toggle(books()[6]!, 6, false);
    selection.toggle(books()[3]!, 3, false);
    selection.toggle(books()[1]!, 1, true);

    expect(selection.count()).toBe(4);
    expect(selection.isSelected(7, 6)).toBe(true);
  });

  it('keeps the anchor after a shift range, Gmail-style', () => {
    const {selection, books} = harness(10, [[0, 9]]);
    selection.toggle(books()[2]!, 2, false);
    selection.toggle(books()[4]!, 4, true);
    selection.toggle(books()[8]!, 8, true);

    for (let index = 2; index <= 8; index++) {
      expect(selection.isSelected(index + 1, index)).toBe(true);
    }
  });
});

describe('ranges crossing unloaded rows', () => {
  it('shows the whole range selected immediately and merges ids on materialisation', async () => {
    const h = harness(100, [[0, 9], [50, 59]]);
    h.selection.toggle(h.books()[5]!, 5, false);
    h.selection.toggle(h.books()[55]!, 55, true);

    expect(h.selection.isSelected(8, 7)).toBe(true);
    expect(h.selection.isSelected(999, 30)).toBe(true);
    expect(h.selection.isSelected(999, 70)).toBe(false);
    expect(h.selection.count()).toBe(51);
    expect(h.fetchIds).toHaveBeenCalledTimes(1);

    await h.resolveIds(allIds(100));
    expect(h.selection.count()).toBe(51);
    expect(h.selection.selectedIds().size).toBe(51);
    expect(h.selection.selectedIds().has(31)).toBe(true);
    expect(h.selection.idsError()).toBe(false);
  });

  it('keeps loaded-row selections when the ids fetch fails, and can retry', async () => {
    const h = harness(100, [[0, 9]]);
    h.selection.toggle(h.books()[1]!, 1, false);
    h.selection.toggle(summary(31), 30, true);
    expect(h.selection.count()).toBe(30);

    await h.rejectIds();
    expect(h.selection.idsError()).toBe(true);
    for (let index = 1; index <= 9; index++) {
      expect(h.selection.isSelected(index + 1, index)).toBe(true);
    }
    expect(h.selection.isSelected(999, 20)).toBe(false);

    h.selection.retryIds();
    expect(h.selection.idsError()).toBe(false);
    await h.resolveIds(allIds(100));
    expect(h.selection.selectedIds().size).toBe(30);
  });
});

describe('select all', () => {
  it('counts N immediately and materialises to the full id set', async () => {
    const h = harness(1000, [[0, 9]]);
    h.selection.selectAll();

    expect(h.selection.count()).toBe(1000);
    expect(h.selection.allCurrentResultsSelected()).toBe(true);
    expect(h.selection.isSelected(777, 776)).toBe(true);

    await h.resolveIds(allIds(1000));
    expect(h.selection.selectedIds().size).toBe(1000);
    expect(h.selection.count()).toBe(1000);
  });

  it('honours a deselection made while the ids were in flight', async () => {
    const h = harness(1000, [[0, 9]]);
    h.selection.selectAll();
    h.selection.toggle(h.books()[3]!, 3, false);

    expect(h.selection.isSelected(4, 3)).toBe(false);
    expect(h.selection.count()).toBe(999);
    expect(h.selection.allCurrentResultsSelected()).toBe(false);

    await h.resolveIds(allIds(1000));
    expect(h.selection.selectedIds().has(4)).toBe(false);
    expect(h.selection.count()).toBe(999);
  });
});

describe('params changes', () => {
  it('keeps the id selection but resets anchor and pending slice', async () => {
    const h = harness(100, [[0, 9]]);
    h.selection.toggle(h.books()[2]!, 2, false);
    h.selection.selectAll();
    expect(h.selection.count()).toBe(100);

    h.paramsKey.set('params-b');
    expect(h.selection.allCurrentResultsSelected()).toBe(false);
    expect(h.selection.count()).toBe(1);
    expect(h.selection.isSelected(3, 50)).toBe(true);
    h.selection.toggle(h.books()[7]!, 7, true);
    expect(h.selection.count()).toBe(2);

    await h.resolveIds(allIds(100));
    expect(h.selection.count()).toBe(2);
  });
});

describe('bulk-action handoff', () => {
  it('resolvedIds waits for materialisation', async () => {
    const h = harness(50, [[0, 9]]);
    h.selection.selectAll();
    const resolved = h.selection.resolvedIds();
    await h.resolveIds(allIds(50));
    expect((await resolved).length).toBe(50);
  });

  it('resolvedIds rejects when the ids fetch failed', async () => {
    const h = harness(50, [[0, 9]]);
    h.selection.selectAll();
    const resolved = expect(h.selection.resolvedIds()).rejects.toThrow();
    await h.rejectIds();
    await resolved;
  });

  it('prunes deleted ids and empties cleanly', () => {
    const h = harness(10, [[0, 9]]);
    h.selection.toggle(h.books()[0]!, 0, false);
    h.selection.toggle(h.books()[1]!, 1, false);
    h.selection.pruneDeleted([1, 2]);
    expect(h.selection.count()).toBe(0);
    expect(h.selection.active()).toBe(false);
  });
});
