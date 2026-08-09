import { describe, expect, it } from 'vitest';

import {
  type BookSummary,
  type BookSummaryMetadata,
} from '../../../book/data/book-response.models';
import { ReadStatus } from '../../../book/model/book.model';
import {
  calculateReadingHabitsStats,
  type ReadingHabitId,
} from './reading-habits-stats';

const CALCULATION_DATE = new Date('2025-01-01T00:00:00Z');
const HABIT_IDS: readonly ReadingHabitId[] = [
  'consistency',
  'multitasking',
  'completionism',
  'exploration',
  'organization',
  'intensity',
  'methodology',
  'momentum',
];

describe('calculateReadingHabitsStats', () => {
  it('returns no habits for an empty library', () => {
    expect(calculateReadingHabitsStats([], CALCULATION_DATE)).toEqual([]);
  });

  it('returns every habit once with finite, bounded scores', () => {
    const result = calculateReadingHabitsStats([
      makeBook(1, {
        readStatus: ReadStatus.READING,
        pdfProgress: {page: 80, percentage: 80},
        metadata: metadata(1, {pageCount: 1200}),
      }),
      makeBook(2, {
        readStatus: ReadStatus.RE_READING,
        pdfProgress: {page: 80, percentage: 80},
        metadata: metadata(2, {pageCount: 1200}),
      }),
      makeBook(3, {
        readStatus: ReadStatus.PARTIALLY_READ,
        pdfProgress: {page: 50, percentage: 50},
        metadata: metadata(3, {pageCount: 1200}),
      }),
    ], CALCULATION_DATE);

    expect(result.map(({id}) => id)).toEqual(HABIT_IDS);
    expect(new Set(result.map(({id}) => id)).size).toBe(HABIT_IDS.length);
    expect(result.every(({score}) => Number.isFinite(score))).toBe(true);
    expect(result.every(({score}) => score >= 0 && score <= 100)).toBe(true);
  });

  it('scores consistency from regular completion gaps and ignores malformed dates', () => {
    const result = calculateReadingHabitsStats([
      finishedBook(1, '2024-01-01'),
      finishedBook(2, 'not-a-date'),
      finishedBook(3, '2024-01-11'),
      finishedBook(4, '2024-01-21'),
    ], CALCULATION_DATE);

    expect(habit(result, 'consistency')).toEqual({
      id: 'consistency',
      score: 75,
      level: 'high',
    });
  });

  it('scores multitasking from active and partially read books and caps it at 100', () => {
    const activeBooks = Array.from({length: 5}, (_, index) => makeBook(index + 1, {
      readStatus: index % 2 === 0 ? ReadStatus.READING : ReadStatus.RE_READING,
    }));
    const partialBooks = Array.from({length: 5}, (_, index) => makeBook(index + 6, {
      readStatus: ReadStatus.PARTIALLY_READ,
      pdfProgress: {page: 50, percentage: 50},
    }));

    expect(habit(
      calculateReadingHabitsStats([...activeBooks, ...partialBooks], CALCULATION_DATE),
      'multitasking',
    )).toEqual({id: 'multitasking', score: 100, level: 'high'});
  });

  it('scores completionism from completed and abandoned started books', () => {
    const result = calculateReadingHabitsStats([
      finishedBook(1, '2024-01-01'),
      finishedBook(2, '2024-02-01'),
      finishedBook(3, '2024-03-01'),
      makeBook(4, {readStatus: ReadStatus.ABANDONED}),
    ], CALCULATION_DATE);

    expect(habit(result, 'completionism')).toEqual({
      id: 'completionism',
      score: 75,
      level: 'high',
    });
  });

  it('scores exploration from author, publication-year, and language diversity', () => {
    const result = calculateReadingHabitsStats([
      exploratoryBook(1, 'Author One', 'en', '1900'),
      exploratoryBook(2, 'Author Two', 'fr', '1950'),
      exploratoryBook(3, 'Author Three', 'de', '2000'),
      exploratoryBook(4, 'Author Four', 'en', '2025'),
    ], CALCULATION_DATE);

    expect(habit(result, 'exploration')).toEqual({
      id: 'exploration',
      score: 100,
      level: 'high',
    });
  });

  it('scores organization from ratings, explicit statuses, and series numbering', () => {
    const result = calculateReadingHabitsStats([
      finishedBook(1, '2024-01-01', {
        personalRating: 4,
        metadata: metadata(1, {seriesName: 'Saga', seriesNumber: 1}),
      }),
      finishedBook(2, '2024-02-01', {
        metadata: metadata(2, {seriesName: 'Saga'}),
      }),
    ], CALCULATION_DATE);

    expect(habit(result, 'organization')).toEqual({
      id: 'organization',
      score: 68,
      level: 'high',
    });
  });

  it.each([
    {pageCount: 320, progress: 0, expectedScore: 32, expectedLevel: 'low'},
    {pageCount: 330, progress: 0, expectedScore: 33, expectedLevel: 'mid'},
    {pageCount: 260, progress: 80, expectedScore: 66, expectedLevel: 'mid'},
    {pageCount: 270, progress: 80, expectedScore: 67, expectedLevel: 'high'},
  ] as const)(
    'maps intensity score $expectedScore to the $expectedLevel level',
    ({pageCount, progress, expectedScore, expectedLevel}) => {
      const books = Array.from({length: 10}, (_, index) => makeBook(index + 1, {
        readStatus: ReadStatus.PARTIALLY_READ,
        pdfProgress: {page: progress, percentage: progress},
        metadata: metadata(index + 1, {pageCount}),
      }));

      expect(habit(
        calculateReadingHabitsStats(books, CALCULATION_DATE),
        'intensity',
      )).toEqual({id: 'intensity', score: expectedScore, level: expectedLevel});
    },
  );

  it('scores methodology from ordered series and repeated author and genre choices', () => {
    const books = Array.from({length: 5}, (_, index) => finishedBook(
      index + 1,
      `2024-0${index + 1}-01`,
      {
        metadata: metadata(index + 1, {
          authors: ['Repeat Author'],
          categories: ['Repeat Genre'],
          ...(index < 2 ? {seriesName: 'Saga', seriesNumber: index + 1} : {}),
        }),
      },
    ));

    expect(habit(
      calculateReadingHabitsStats(books, CALCULATION_DATE),
      'methodology',
    )).toEqual({id: 'methodology', score: 65, level: 'mid'});
  });

  it('does not treat an unread series as evidence of ordered reading', () => {
    const books = [1, 2].map((seriesNumber) => makeBook(seriesNumber, {
      readStatus: ReadStatus.UNREAD,
      metadata: metadata(seriesNumber, {seriesName: 'Series', seriesNumber}),
    }));

    expect(habit(
      calculateReadingHabitsStats(books, CALCULATION_DATE),
      'methodology',
    )).toEqual({id: 'methodology', score: 25, level: 'low'});
  });

  it('uses the supplied calculation date for momentum', () => {
    const books = [finishedBook(1, '2024-08-01')];

    const duringRecentWindow = calculateReadingHabitsStats(
      books,
      new Date('2025-01-01T00:00:00Z'),
    );
    const afterRecentWindow = calculateReadingHabitsStats(
      books,
      new Date('2025-03-01T00:00:00Z'),
    );

    expect(habit(duringRecentWindow, 'momentum')).toEqual({
      id: 'momentum',
      score: 8,
      level: 'low',
    });
    expect(habit(afterRecentWindow, 'momentum')).toEqual({
      id: 'momentum',
      score: 0,
      level: 'low',
    });
  });

  it('excludes completions after the supplied calculation date from momentum', () => {
    const result = calculateReadingHabitsStats(
      [finishedBook(1, '2025-02-01')],
      new Date('2025-01-01T00:00:00Z'),
    );

    expect(habit(result, 'momentum')).toEqual({
      id: 'momentum',
      score: 0,
      level: 'low',
    });
  });
});

function habit(
  stats: ReturnType<typeof calculateReadingHabitsStats>,
  id: ReadingHabitId,
) {
  const result = stats.find((candidate) => candidate.id === id);
  expect(result).toBeDefined();
  return result;
}

function makeBook(id: number, overrides: Partial<BookSummary> = {}): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.UNREAD,
    ...overrides,
  };
}

function finishedBook(
  id: number,
  dateFinished: string,
  overrides: Partial<BookSummary> = {},
): BookSummary {
  return makeBook(id, {
    readStatus: ReadStatus.READ,
    dateFinished,
    ...overrides,
  });
}

function exploratoryBook(
  id: number,
  author: string,
  language: string,
  publishedDate: string,
): BookSummary {
  return makeBook(id, {
    metadata: metadata(id, {authors: [author], language, publishedDate}),
  });
}

function metadata(
  bookId: number,
  overrides: Partial<BookSummaryMetadata> = {},
): BookSummaryMetadata {
  return {
    bookId,
    allMetadataLocked: false,
    ...overrides,
  };
}
