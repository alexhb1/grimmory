import { describe, expect, it } from 'vitest';

import { type BookSummary } from '../../../book/data/book-response.models';
import { extractPublicationYear } from '../library/publication-year';
import { calculatePublicationEraStats } from './publication-era-stats';
import { calculateReadingDnaStats } from './reading-dna-stats';
import { calculateReadingHabitsStats } from './reading-habits-stats';

describe('date-only publication metadata', () => {
  it('keeps a January publication in its stated decade', () => {
    const books = [1, 2, 3].map((id) => book(id, '2000-01-01', 8));

    const result = calculatePublicationEraStats(books);

    expect(result.decades).toHaveLength(1);
    expect(result.decades[0].startYear).toBe(2000);
  });

  it('uses stated publication years when scoring exploration', () => {
    const result = calculateReadingHabitsStats([
      book(1, '2000-01-01'),
      book(2, '2020-07-01T00:00:00Z'),
    ]);

    expect(result.find((habit) => habit.id === 'exploration')?.score).toBe(40);
  });

  it('does not make a threshold-year book nostalgic by shifting it backwards', () => {
    const thresholdYear = new Date().getFullYear() - 30;
    const result = calculateReadingDnaStats([book(1, `${thresholdYear}-01-01`)]);

    expect(result.find((trait) => trait.id === 'nostalgic')?.score).toBe(0);
  });

  it('rejects a year embedded in arbitrary text', () => {
    expect(extractPublicationYear('garbage-2001-value', 2026)).toBeNull();
  });
});

function book(id: number, publishedDate: string, personalRating?: number): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Test',
    personalRating,
    metadata: {
      bookId: id,
      title: `Book ${id}`,
      publishedDate,
      authors: ['Author'],
      allMetadataLocked: false,
    },
  };
}
