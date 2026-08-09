import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateAuthorUniverseStats } from './author-universe-stats';

type AuthorUniverseBook = Parameters<typeof calculateAuthorUniverseStats>[0][number];

describe('calculateAuthorUniverseStats', () => {
  it('compares personal and external ratings on the same five-point scale', () => {
    const stats = calculateAuthorUniverseStats([
      book(1, 'Personal', { personalRating: 8 }),
      book(2, 'Personal', { personalRating: 10 }),
      book(3, 'External', { goodreadsRating: 4.2 }),
      book(4, 'External', { goodreadsRating: 4.4 }),
    ]);

    expect(stats.authors.map(({ name }) => name)).toEqual(['External', 'Personal']);
    expect(stats.authors.find(({ name }) => name === 'Personal')?.averageRating).toBe(4.5);
    expect(stats.authors.find(({ name }) => name === 'External')?.averageRating).toBeCloseTo(4.3);
    expect(stats.insights?.highestRated).toEqual({
      name: 'Personal',
      averageRating: 4.5,
      bookCount: 2,
    });
  });

  it('uses distinct collection books and actual read pages for overall percentages', () => {
    const stats = calculateAuthorUniverseStats([
      book(1, ['Alpha', 'Beta', 'Gamma'], { pageCount: 100, readStatus: ReadStatus.READ }),
      book(2, ['Alpha'], { pageCount: 900 }),
      book(3, ['Beta'], {}),
      book(4, ['Gamma'], {}),
      book(5, ['Other'], {}),
      book(6, ['Other'], {}),
    ]);

    expect(stats.insights?.topThreeSharePercent).toBe(67);
    expect(stats.insights?.overallProgressPercent).toBe(10);
  });

  it('counts each author once per book and ranks genres by frequency', () => {
    const stats = calculateAuthorUniverseStats([
      book(1, ['Ada', ' Ada ', 'Ada'], { categories: ['Rare', 'Common', 'Common'] }),
      book(2, 'Ada', { categories: ['Common'] }),
    ]);

    expect(stats.authors[0]).toMatchObject({
      name: 'Ada',
      bookCount: 2,
      topGenres: ['Common', 'Rare'],
    });
  });

  it('calculates insights before applying the visual author limit', () => {
    const books = Array.from({ length: 51 }, (_, authorIndex) => [
      book(authorIndex * 2 + 1, `Author ${String(authorIndex).padStart(2, '0')}`, {
        personalRating: authorIndex === 50 ? 10 : 2,
      }),
      book(authorIndex * 2 + 2, `Author ${String(authorIndex).padStart(2, '0')}`, {
        personalRating: authorIndex === 50 ? 10 : 2,
      }),
    ]).flat();

    const stats = calculateAuthorUniverseStats(books);

    expect(stats.authors).toHaveLength(50);
    expect(stats.authors.some(({ name }) => name === 'Author 50')).toBe(false);
    expect(stats.insights?.highestRated?.name).toBe('Author 50');
  });

  it('averages author page counts over books with known positive page counts', () => {
    const stats = calculateAuthorUniverseStats([
      book(1, 'Sparse', { pageCount: 500 }),
      book(2, 'Sparse', {}),
      book(3, 'Complete', { pageCount: 400 }),
      book(4, 'Complete', { pageCount: 400 }),
    ]);

    expect(stats.insights?.longestReads).toEqual({ name: 'Sparse', count: 500 });
  });

  it('ranks exact page averages before rounding the displayed count', () => {
    const stats = calculateAuthorUniverseStats([
      book(1, 'Alpha', { pageCount: 300 }),
      book(2, 'Alpha', { pageCount: 301 }),
      book(3, 'Beta', { pageCount: 300 }),
      book(4, 'Beta', { pageCount: 300 }),
    ]);

    expect(stats.insights?.longestReads).toEqual({ name: 'Alpha', count: 301 });
  });

  it('ignores ratings outside their source scale', () => {
    const stats = calculateAuthorUniverseStats([
      book(1, 'Invalid', { personalRating: 11 }),
      book(2, 'Invalid', { personalRating: -1 }),
    ]);

    expect(stats.authors[0]?.averageRating).toBe(0);
    expect(stats.insights?.highestRated).toBeNull();
  });
});

function book(
  id: number,
  author: string | readonly string[],
  details: {
    personalRating?: number;
    goodreadsRating?: number;
    pageCount?: number;
    readStatus?: ReadStatus;
    categories?: readonly string[];
  },
): AuthorUniverseBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: details.readStatus ?? ReadStatus.UNREAD,
    personalRating: details.personalRating,
    metadata: {
      bookId: id,
      authors: typeof author === 'string' ? [author] : [...author],
      goodreadsRating: details.goodreadsRating,
      pageCount: details.pageCount,
      categories: details.categories ? [...details.categories] : undefined,
      allMetadataLocked: false,
    },
  };
}
