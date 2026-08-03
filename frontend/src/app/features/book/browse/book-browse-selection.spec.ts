import {signal, type WritableSignal} from '@angular/core';
import {describe, expect, it, vi} from 'vitest';

import {type BookSummary} from '../data/book-response.models';
import {
  createBookBrowseSelection,
  resolveSelectedBookIds,
  type BookBrowseSelection,
} from './book-browse-selection';

function summary(id: number): BookSummary {
  return {id} as BookSummary;
}

interface Harness {
  selection: BookBrowseSelection;
  membershipIdentity: WritableSignal<string>;
  orderingIdentity: WritableSignal<string>;
  books: WritableSignal<readonly BookSummary[]>;
  totalElements: WritableSignal<number | null>;
}

function harness(total: number | null, loadedIds: readonly number[]): Harness {
  const membershipIdentity = signal('members-a');
  const orderingIdentity = signal('order-a');
  const books = signal(loadedIds.map(summary));
  const totalElements = signal<number | null>(total);

  const selection = createBookBrowseSelection({
    membershipIdentity,
    orderingIdentity,
    books,
    totalElements,
  });

  return {selection, membershipIdentity, orderingIdentity, books, totalElements};
}

const allIds = (total: number) => Array.from({length: total}, (_, index) => index + 1);

describe('plain toggling', () => {
  it('selects and deselects by id and moves the anchor', () => {
    const {selection, books} = harness(10, allIds(10));
    const book = books()[2];

    selection.toggle(book, 2, false);
    expect(selection.isSelected(book.id)).toBe(true);
    expect(selection.count()).toBe(1);
    expect(selection.active()).toBe(true);
    expect(selection.state().mode).toBe('explicit');

    selection.toggle(book, 2, false);
    expect(selection.isSelected(book.id)).toBe(false);
    expect(selection.count()).toBe(0);
    expect(selection.active()).toBe(false);
  });

  it('treats shift with no anchor as a plain toggle', () => {
    const {selection, books} = harness(10, allIds(10));
    selection.toggle(books()[4], 4, true);
    expect(selection.count()).toBe(1);
    expect(selection.isSelected(5)).toBe(true);
  });
});

describe('shift ranges over loaded rows', () => {
  it('selects the inclusive anchor→target range', () => {
    const {selection, books} = harness(100, [41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    selection.toggle(books()[2], 2, false);
    selection.toggle(books()[6], 6, true);

    for (let index = 2; index <= 6; index++) {
      expect(selection.isSelected(books()[index].id)).toBe(true);
    }
    expect(selection.count()).toBe(5);
  });

  it('keeps the anchor after a shift range, Gmail-style', () => {
    const {selection, books} = harness(10, allIds(10));
    selection.toggle(books()[2], 2, false);
    selection.toggle(books()[4], 4, true);
    selection.toggle(books()[8], 8, true);

    for (let index = 2; index <= 8; index++) {
      expect(selection.isSelected(index + 1)).toBe(true);
    }
  });

  it('falls back to a plain toggle when the anchor has left the loaded window', () => {
    const h = harness(100, [1, 2, 3, 4]);
    h.selection.toggle(h.books()[1], 1, false);

    h.books.set([61, 62, 63, 64].map(summary));
    h.selection.toggle(h.books()[3], 3, true);

    expect(h.selection.isSelected(2)).toBe(true);
    expect(h.selection.isSelected(64)).toBe(true);
    expect(h.selection.count()).toBe(2);

    h.selection.toggle(h.books()[0], 0, true);
    for (const id of [2, 61, 62, 63, 64]) {
      expect(h.selection.isSelected(id)).toBe(true);
    }
    expect(h.selection.count()).toBe(5);
  });
});

describe('select all', () => {
  it('enters allMatching, discards explicit ids, and clears back to empty explicit', () => {
    const h = harness(1000, allIds(10));
    h.selection.toggle(h.books()[0], 0, false);
    h.selection.selectAll();

    expect(h.selection.state().mode).toBe('allMatching');
    expect(h.selection.count()).toBe(1000);
    expect(h.selection.allCurrentResultsSelected()).toBe(true);
    expect(h.selection.isSelected(777)).toBe(true);

    h.selection.clear();
    expect(h.selection.state()).toEqual({mode: 'explicit', ids: new Set()});
  });

  it('excludes on toggle, re-includes via toggle or shift-range, resets on repeat select-all', () => {
    const h = harness(50, allIds(10));
    h.selection.selectAll();

    h.selection.toggle(h.books()[4], 4, false);
    expect(h.selection.isSelected(5)).toBe(false);
    expect(h.selection.count()).toBe(49);
    expect(h.selection.allCurrentResultsSelected()).toBe(false);

    h.selection.toggle(h.books()[4], 4, false);
    expect(h.selection.isSelected(5)).toBe(true);

    h.selection.toggle(h.books()[2], 2, false);
    h.selection.toggle(h.books()[5], 5, true);
    expect(h.selection.isSelected(3)).toBe(true);
    expect(h.selection.isSelected(6)).toBe(true);

    h.selection.toggle(h.books()[7], 7, false);
    h.selection.selectAll();
    expect(h.selection.count()).toBe(50);
  });

  it('collapses to empty explicit when the last matching book is deselected', () => {
    const h = harness(2, [1, 2]);
    h.selection.selectAll();
    h.selection.toggle(h.books()[0], 0, false);
    h.selection.toggle(h.books()[1], 1, false);

    expect(h.selection.state()).toEqual({mode: 'explicit', ids: new Set()});
    expect(h.selection.active()).toBe(false);
  });

  it('is a no-op when the total is null or zero', () => {
    for (const total of [null, 0]) {
      const h = harness(total, []);
      h.selection.selectAll();
      expect(h.selection.state().mode).toBe('explicit');
    }
  });

  it('tracks a live total change in allMatching', () => {
    const h = harness(100, allIds(10));
    h.selection.selectAll();

    h.totalElements.set(140);
    expect(h.selection.count()).toBe(140);
    expect(h.selection.allCurrentResultsSelected()).toBe(true);
  });
});

describe('collection changes', () => {
  it('keeps explicit ids but resets the range anchor when ordering changes', () => {
    const h = harness(100, allIds(10));
    h.selection.toggle(h.books()[2], 2, false);

    h.orderingIdentity.set('order-b');
    h.selection.toggle(h.books()[7], 7, true);

    expect(h.selection.isSelected(3)).toBe(true);
    expect(h.selection.isSelected(8)).toBe(true);
    expect(h.selection.count()).toBe(2);
  });

  it('keeps allMatching and its exclusions when only ordering changes', () => {
    const h = harness(100, allIds(10));
    h.selection.selectAll();
    h.selection.toggle(h.books()[3], 3, false);

    h.orderingIdentity.set('order-b');
    expect(h.selection.state().mode).toBe('allMatching');
    expect(h.selection.count()).toBe(99);
    expect(h.selection.isSelected(4)).toBe(false);
  });

  it('resets allMatching synchronously when membership changes', () => {
    const h = harness(100, allIds(10));
    h.selection.selectAll();
    h.selection.toggle(h.books()[2], 2, false);
    expect(h.selection.count()).toBe(99);

    h.membershipIdentity.set('members-b');
    expect(h.selection.state().mode).toBe('explicit');
    expect(h.selection.count()).toBe(0);
    expect(h.selection.allCurrentResultsSelected()).toBe(false);
    expect(h.selection.isSelected(1)).toBe(false);
  });
});

describe('pruneDeleted', () => {
  it('removes ids from an explicit selection', () => {
    const h = harness(10, allIds(10));
    h.selection.toggle(h.books()[0], 0, false);
    h.selection.toggle(h.books()[1], 1, false);

    h.selection.pruneDeleted([1, 2]);
    expect(h.selection.count()).toBe(0);
    expect(h.selection.active()).toBe(false);
  });

  it('drops pruned ids from the exclusions in allMatching', () => {
    const h = harness(50, allIds(10));
    h.selection.selectAll();
    h.selection.toggle(h.books()[0], 0, false);
    expect(h.selection.count()).toBe(49);

    h.selection.pruneDeleted([1]);
    h.totalElements.set(49);
    expect(h.selection.state().mode).toBe('allMatching');
    expect(h.selection.count()).toBe(49);
  });
});

describe('resolveSelectedBookIds', () => {
  it('returns explicit ids without fetching', async () => {
    const fetchIds = vi.fn(() => Promise.resolve<readonly number[]>([9, 9, 9]));
    const resolved = await resolveSelectedBookIds({mode: 'explicit', ids: new Set([3, 1, 2])}, fetchIds);

    expect(resolved).toEqual([3, 1, 2]);
    expect(fetchIds).not.toHaveBeenCalled();
  });

  it('filters exclusions out of the fetched ids', async () => {
    const fetchIds = vi.fn(() => Promise.resolve<readonly number[]>([1, 2, 3, 4, 5]));
    const resolved = await resolveSelectedBookIds(
      {mode: 'allMatching', excludedIds: new Set([2, 4])},
      fetchIds,
    );

    expect(resolved).toEqual([1, 3, 5]);
    expect(fetchIds).toHaveBeenCalledOnce();
  });
});
