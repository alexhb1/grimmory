import {signal, type WritableSignal} from '@angular/core';
import {describe, expect, it, vi} from 'vitest';

import {type BookSummary} from '../data/book-response.models';
import {createBookBrowseSelection, type BookBrowseSelection} from './book-browse-selection';

function summary(id: number): BookSummary {
  return {id} as BookSummary;
}

interface Harness {
  selection: BookBrowseSelection;
  membershipIdentity: WritableSignal<string>;
  orderingIdentity: WritableSignal<string>;
  books: WritableSignal<readonly BookSummary[]>;
  totalElements: WritableSignal<number | null>;
  fetchIds: ReturnType<typeof vi.fn>;
  resolveIds: (ids: readonly number[]) => Promise<void>;
  rejectIds: () => Promise<void>;
}

function harness(total: number, loadedIds: readonly number[]): Harness {
  const membershipIdentity = signal('members-a');
  const orderingIdentity = signal('order-a');
  const books = signal(loadedIds.map(summary));
  const totalElements = signal<number | null>(total);
  let resolve: (ids: readonly number[]) => void;
  let reject: (error: unknown) => void;
  const fetchIds = vi.fn(() => new Promise<readonly number[]>((res, rej) => {
    resolve = res;
    reject = rej;
  }));

  const selection = createBookBrowseSelection({
    membershipIdentity,
    orderingIdentity,
    books,
    totalElements,
    fetchIds,
  });
  const settle = () => new Promise<void>(done => setTimeout(done, 0));

  return {
    selection,
    membershipIdentity,
    orderingIdentity,
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
    const {selection, books} = harness(10, allIds(10));
    const book = books()[2]!;

    selection.toggle(book, 2, false);
    expect(selection.isSelected(book.id)).toBe(true);
    expect(selection.count()).toBe(1);
    expect(selection.active()).toBe(true);

    selection.toggle(book, 2, false);
    expect(selection.isSelected(book.id)).toBe(false);
    expect(selection.count()).toBe(0);
    expect(selection.active()).toBe(false);
  });

  it('treats shift with no anchor as a plain toggle', () => {
    const {selection, books} = harness(10, allIds(10));
    selection.toggle(books()[4]!, 4, true);
    expect(selection.count()).toBe(1);
    expect(selection.isSelected(5)).toBe(true);
  });
});

describe('shift ranges over loaded rows', () => {
  it('selects the inclusive anchor→target range without fetching ids', () => {
    const {selection, books, fetchIds} = harness(100, [41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    selection.toggle(books()[2]!, 2, false);
    selection.toggle(books()[6]!, 6, true);

    for (let index = 2; index <= 6; index++) {
      expect(selection.isSelected(books()[index]!.id)).toBe(true);
    }
    expect(selection.count()).toBe(5);
    expect(fetchIds).not.toHaveBeenCalled();
  });

  it('selects ranges upward from the anchor and never deselects', () => {
    const {selection, books} = harness(10, allIds(10));
    selection.toggle(books()[6]!, 6, false);
    selection.toggle(books()[3]!, 3, false);
    selection.toggle(books()[1]!, 1, true);

    expect(selection.count()).toBe(4);
    expect(selection.isSelected(7)).toBe(true);
  });

  it('keeps the anchor after a shift range, Gmail-style', () => {
    const {selection, books} = harness(10, allIds(10));
    selection.toggle(books()[2]!, 2, false);
    selection.toggle(books()[4]!, 4, true);
    selection.toggle(books()[8]!, 8, true);

    for (let index = 2; index <= 8; index++) {
      expect(selection.isSelected(index + 1)).toBe(true);
    }
  });

  it('falls back to a plain toggle when the anchor has left the loaded window', () => {
    const h = harness(100, [1, 2, 3, 4]);
    h.selection.toggle(h.books()[1]!, 1, false);

    h.books.set([61, 62, 63, 64].map(summary));
    h.selection.toggle(h.books()[3]!, 3, true);

    expect([...h.selection.selectedIds()]).toEqual([2, 64]);
    expect(h.selection.count()).toBe(2);
    expect(h.fetchIds).not.toHaveBeenCalled();

    h.selection.toggle(h.books()[0]!, 0, true);
    expect(h.selection.selectedIds()).toEqual(new Set([2, 61, 62, 63, 64]));
  });
});

describe('select all', () => {
  it('counts N immediately and materialises to the full id set', async () => {
    const h = harness(1000, allIds(10));
    h.selection.selectAll();

    expect(h.selection.count()).toBe(1000);
    expect(h.selection.allCurrentResultsSelected()).toBe(true);
    expect(h.selection.isSelected(777)).toBe(true);

    await h.resolveIds(allIds(1000));
    expect(h.selection.selectedIds().size).toBe(1000);
    expect(h.selection.count()).toBe(1000);
  });

  it('honours a deselection made while the ids were in flight', async () => {
    const h = harness(1000, allIds(10));
    h.selection.selectAll();
    h.selection.toggle(h.books()[3]!, 3, false);

    expect(h.selection.isSelected(4)).toBe(false);
    expect(h.selection.count()).toBe(999);
    expect(h.selection.allCurrentResultsSelected()).toBe(false);

    await h.resolveIds(allIds(1000));
    expect(h.selection.selectedIds().has(4)).toBe(false);
    expect(h.selection.count()).toBe(999);
  });

  it('retries select-all materialisation after the IDs request fails', async () => {
    const h = harness(50, allIds(10));
    h.selection.selectAll();

    await h.rejectIds();
    expect(h.selection.idsError()).toBe(true);
    expect(h.selection.allCurrentResultsSelected()).toBe(false);

    h.selection.retryIds();
    expect(h.fetchIds).toHaveBeenCalledTimes(2);
    expect(h.selection.idsError()).toBe(false);

    await h.resolveIds(allIds(50));
    expect(h.selection.allCurrentResultsSelected()).toBe(true);
    expect(h.selection.selectedIds().size).toBe(50);
  });
});

describe('collection changes', () => {
  it('keeps explicit IDs but resets the range anchor when ordering changes', () => {
    const h = harness(100, allIds(10));
    h.selection.toggle(h.books()[2]!, 2, false);

    h.orderingIdentity.set('order-b');
    h.selection.toggle(h.books()[7]!, 7, true);

    expect(h.selection.selectedIds()).toEqual(new Set([3, 8]));
  });

  it('keeps an in-flight select-all when only ordering changes', async () => {
    const h = harness(100, allIds(10));
    h.selection.selectAll();

    h.orderingIdentity.set('order-b');
    expect(h.selection.count()).toBe(100);
    expect(h.selection.allCurrentResultsSelected()).toBe(true);

    await h.resolveIds(allIds(100));
    expect(h.selection.selectedIds().size).toBe(100);
  });

  it('clears selection when membership changes and ignores the old IDs result', async () => {
    const h = harness(100, allIds(10));
    h.selection.toggle(h.books()[2]!, 2, false);
    h.selection.selectAll();
    expect(h.selection.count()).toBe(100);

    h.membershipIdentity.set('members-b');
    h.orderingIdentity.set('order-b');
    expect(h.selection.allCurrentResultsSelected()).toBe(false);
    expect(h.selection.count()).toBe(0);
    expect(h.selection.isSelected(3)).toBe(false);

    h.membershipIdentity.set('members-a');
    h.orderingIdentity.set('order-a');

    await h.resolveIds(allIds(100));
    expect(h.selection.count()).toBe(0);
  });
});

describe('bulk-action handoff', () => {
  it('resolvedIds waits for materialisation', async () => {
    const h = harness(50, allIds(10));
    h.selection.selectAll();
    const resolved = h.selection.resolvedIds();
    await h.resolveIds(allIds(50));
    expect((await resolved).length).toBe(50);
  });

  it('resolvedIds rejects when the ids fetch failed', async () => {
    const h = harness(50, allIds(10));
    h.selection.selectAll();
    const resolved = expect(h.selection.resolvedIds()).rejects.toThrow();
    await h.rejectIds();
    await resolved;
  });

  it('prunes deleted ids and empties cleanly', () => {
    const h = harness(10, allIds(10));
    h.selection.toggle(h.books()[0]!, 0, false);
    h.selection.toggle(h.books()[1]!, 1, false);
    h.selection.pruneDeleted([1, 2]);
    expect(h.selection.count()).toBe(0);
    expect(h.selection.active()).toBe(false);
  });
});
