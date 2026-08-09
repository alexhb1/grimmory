import { describe, expect, it } from 'vitest';

import { type BookSummary } from '../../../book/data/book-response.models';
import { ReadStatus } from '../../../book/model/book.model';
import {
  BOOK_FLOW_OTHER_QUARTERS_ID,
  calculateBookFlowStats,
} from './book-flow-stats';

describe('calculateBookFlowStats', () => {
  it('maps malformed added dates to the unknown quarter without losing books', () => {
    const invalidDateBook = {
      ...book(1, 2024),
      addedOn: 'not-a-date',
    };

    const stats = calculateBookFlowStats([invalidDateBook]);

    expect(stats.busiestQuarter).toBeNull();
    expect(stats.nodes).toContainEqual({
      id: 'unknown',
      column: 'added',
      count: 1,
      quarter: null,
    });
    expect(stats.links).toContainEqual(expect.objectContaining({
      sourceId: 'unknown',
      sourceColumn: 'added',
      value: 1,
    }));
    expect(stats.links
      .filter((link) => link.sourceColumn === 'added')
      .reduce((total, link) => total + link.value, 0)).toBe(stats.totalBooks);
  });

  it('chooses the busiest known quarter even when unknown dates are more common', () => {
    const stats = calculateBookFlowStats([
      { ...book(1, 2024), addedOn: undefined },
      { ...book(2, 2024), addedOn: 'not-a-date' },
      book(3, 2025),
    ]);

    expect(stats.busiestQuarter).toEqual({ year: 2025, quarter: 1 });
  });

  it('aggregates omitted quarters without emitting dangling links', () => {
    const books = Array.from({ length: 10 }, (_, index) => book(index + 1, 2023 + index));
    const stats = calculateBookFlowStats(books);
    const nodeKeys = new Set(stats.nodes.map((node) => `${node.column}:${node.id}`));

    expect(stats.nodes.filter((node) => node.column === 'added')).toHaveLength(8);
    expect(stats.nodes).toContainEqual(expect.objectContaining({
      id: BOOK_FLOW_OTHER_QUARTERS_ID,
      column: 'added',
      count: 3,
    }));
    expect(stats.links.every((link) =>
      nodeKeys.has(`${link.sourceColumn}:${link.sourceId}`)
      && nodeKeys.has(`${link.targetColumn}:${link.targetId}`),
    )).toBe(true);
    expect(stats.links
      .filter((link) => link.sourceColumn === 'added')
      .reduce((total, link) => total + link.value, 0)).toBe(books.length);
  });

  it('groups added timestamps in the supplied reader timezone', () => {
    const value = { ...book(1, 2026), addedOn: '2026-04-01T00:30:00Z' };

    expect(calculateBookFlowStats([value], 'UTC').busiestQuarter).toEqual({
      year: 2026,
      quarter: 2,
    });
    expect(calculateBookFlowStats([value], 'America/Los_Angeles').busiestQuarter).toEqual({
      year: 2026,
      quarter: 1,
    });
  });
});

function book(id: number, year: number): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.READ,
    addedOn: `${year}-01-01T00:00:00Z`,
  };
}
