import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateTopItemsStats } from './top-items-stats';

type TopItemsBook = Parameters<typeof calculateTopItemsStats>[0][number];

describe('calculateTopItemsStats', () => {
  it('measures top-five coverage using distinct books', () => {
    const books = Array.from({ length: 6 }, (_, index) =>
      book(index + 1, [`Author ${index}`, 'Shared A', 'Shared B', 'Shared C', 'Shared D']),
    );

    expect(calculateTopItemsStats(books).kinds.authors.topFiveSharePercent).toBe(100);
  });

  it('keeps the existing top-fifteen semantic result', () => {
    const books = Array.from({ length: 16 }, (_, index) => book(index + 1, [`Author ${index}`]));

    expect(calculateTopItemsStats(books).kinds.authors.items).toHaveLength(15);
  });

  it('calculates summary metrics from all items while returning only the top fifteen', () => {
    const displayedAuthors = Array.from({ length: 15 }, (_, index) => `Author ${index}`);
    const books = [
      book(1, displayedAuthors),
      book(2, displayedAuthors),
      book(3, displayedAuthors),
      book(4, ['Zed'], ReadStatus.READ),
      book(5, ['Zed'], ReadStatus.READ),
    ];

    const stats = calculateTopItemsStats(books).kinds.authors;

    expect(stats.items).toHaveLength(15);
    expect(stats.items.some((item) => item.name === 'Zed')).toBe(false);
    expect(stats.averageBooksPerItem).toBe(47 / 16);
    expect(stats.topFiveSharePercent).toBe(60);
    expect(stats.mostCompleted).toEqual({ name: 'Zed', readPercent: 100 });
  });

  it('counts a repeated metadata value once per book and resolves ties deterministically', () => {
    const stats = calculateTopItemsStats([
      book(1, ['Beta', ' Beta ', 'Alpha']),
      book(2, ['Alpha', 'Beta']),
    ]);

    expect(stats.kinds.authors.items).toEqual([
      expect.objectContaining({ name: 'Alpha', bookCount: 2 }),
      expect.objectContaining({ name: 'Beta', bookCount: 2 }),
    ]);
  });
});

function book(
  id: number,
  authors: string[],
  readStatus: TopItemsBook['readStatus'] = ReadStatus.UNREAD,
): TopItemsBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus,
    metadata: {
      bookId: id,
      authors,
      allMetadataLocked: false,
    },
  };
}
