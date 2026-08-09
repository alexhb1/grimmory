import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateLanguageStats } from './language-stats';

type LanguageBook = Parameters<typeof calculateLanguageStats>[0][number];

describe('calculateLanguageStats', () => {
  it('preserves distinct source language identifiers', () => {
    const stats = calculateLanguageStats([
      book(1, 'en'),
      book(2, 'ENG'),
      book(3, ' English '),
      book(4, 'fra'),
    ]);

    expect(stats.languages).toEqual([
      { languageId: 'en', bookCount: 1 },
      { languageId: 'eng', bookCount: 1 },
      { languageId: 'english', bookCount: 1 },
      { languageId: 'fra', bookCount: 1 },
    ]);
  });

  it('keeps the top fifteen distinct languages without aggregating an other group', () => {
    const stats = calculateLanguageStats(
      Array.from({ length: 16 }, (_, index) => book(index + 1, `language-${index}`)),
    );

    expect(stats.totalBooks).toBe(16);
    expect(stats.languages).toHaveLength(15);
    expect(stats.languages.some(({ languageId }) => languageId === 'other')).toBe(false);
  });
});

function book(id: number, language: string): LanguageBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.UNREAD,
    metadata: {
      bookId: id,
      language,
      allMetadataLocked: false,
    },
  };
}
