import { describe, expect, it } from 'vitest';

import { type BookSummary } from '../../../book/data/book-response.models';
import { ReadStatus } from '../../../book/model/book.model';
import {
  calculateReadingDnaStats,
  type ReadingDnaTraitId,
} from './reading-dna-stats';

describe('calculateReadingDnaStats', () => {
  it('returns no traits for an empty library', () => {
    expect(calculateReadingDnaStats([], 2025)).toEqual([]);
  });

  it('scores adventure from genre and language diversity, capped at 100', () => {
    expect(traitScore([book()], 'adventurous')).toBe(0);
    expect(traitScore([
      book({ id: 1, categories: ['Fantasy'], language: 'en' }),
      book({ id: 2, categories: ['History'], language: 'fr' }),
      book({ id: 3, categories: ['Poetry'], language: 'de' }),
    ], 'adventurous')).toBe(100);
  });

  it('uses eight out of ten as the high-rating threshold', () => {
    expect(traitScore([
      book({ readStatus: ReadStatus.READ, personalRating: 7 }),
    ], 'perfectionist')).toBe(60);
    expect(traitScore([
      book({ readStatus: ReadStatus.READ, personalRating: 8 }),
    ], 'perfectionist')).toBe(100);
  });

  it('scores intellectual genres and books over 400 pages independently', () => {
    expect(traitScore([
      book({ categories: ['Philosophy'], pageCount: 400 }),
    ], 'intellectual')).toBe(70);
    expect(traitScore([
      book({ categories: ['Comedy'], pageCount: 401 }),
    ], 'intellectual')).toBe(30);
    expect(traitScore([
      book({ categories: ['Philosophy'], pageCount: 401 }),
    ], 'intellectual')).toBe(100);
  });

  it('scores emotional genres and rating engagement independently', () => {
    expect(traitScore([book({ categories: ['Romance'] })], 'emotional')).toBe(70);
    expect(traitScore([book({ personalRating: 1 })], 'emotional')).toBe(30);
    expect(traitScore([
      book({ categories: ['Romance'], personalRating: 1 }),
    ], 'emotional')).toBe(100);
  });

  it('applies the patience thresholds for length, series position, and progress', () => {
    expect(traitScore([
      book({ pageCount: 500, seriesName: 'Series', seriesNumber: 1, audiobookProgress: 50 }),
    ], 'patient')).toBe(35);
    expect(traitScore([
      book({ pageCount: 501, seriesName: 'Series', seriesNumber: 1, audiobookProgress: 51 }),
    ], 'patient')).toBe(100);
  });

  it('requires review counts to exceed the social popularity thresholds', () => {
    expect(traitScore([
      book({ categories: ['Fantasy'], goodreadsReviewCount: 10_000 }),
    ], 'social')).toBe(50);
    expect(traitScore([
      book({ categories: ['Fantasy'], goodreadsReviewCount: 10_001 }),
    ], 'social')).toBe(100);
  });

  it('uses the supplied year when deciding whether a book is nostalgic', () => {
    const value = book({ publishedDate: '1994-01-01', categories: ['Classic'] });

    expect(traitScore([value], 'nostalgic', 2024)).toBe(40);
    expect(traitScore([value], 'nostalgic', 2025)).toBe(100);
  });

  it('scores ambition at the 600-page boundary and caps a large library at 100', () => {
    expect(traitScore([book({ pageCount: 600 })], 'ambitious')).toBe(0);
    expect(traitScore([book({ pageCount: 601 })], 'ambitious')).toBe(35);
    expect(traitScore([
      book({ pageCount: 601, readStatus: ReadStatus.READ }),
    ], 'ambitious')).toBe(60);

    const completedChallenges = Array.from({ length: 100 }, (_, index) =>
      book({ id: index + 1, pageCount: 601, readStatus: ReadStatus.READ }));
    expect(traitScore(completedChallenges, 'ambitious')).toBe(100);
  });

  it('always returns the complete bounded trait contract', () => {
    const books = Array.from({ length: 100 }, (_, index) =>
      book({
        id: index + 1,
        categories: [`Classic Romance Philosophy Fantasy ${index}`],
        language: `language-${index % 3}`,
        pageCount: 700,
        personalRating: 10,
        publishedDate: '1900-01-01',
        readStatus: ReadStatus.READ,
        seriesName: 'Series',
        seriesNumber: index + 1,
        goodreadsReviewCount: 100_000,
      }));
    const stats = calculateReadingDnaStats(books, 2025);

    expect(stats.map(({ id }) => id)).toEqual([
      'adventurous',
      'perfectionist',
      'intellectual',
      'emotional',
      'patient',
      'social',
      'nostalgic',
      'ambitious',
    ]);
    expect(stats.every(({ score }) => score >= 0 && score <= 100)).toBe(true);
    expect(stats.every(({ score, level }) => score === 100 && level === 'high')).toBe(true);
  });
});

function traitScore(
  books: readonly BookSummary[],
  id: ReadingDnaTraitId,
  currentYear = 2025,
): number {
  return calculateReadingDnaStats(books, currentYear)
    .find((trait) => trait.id === id)?.score ?? -1;
}

interface BookOptions {
  id?: number;
  readStatus?: ReadStatus;
  personalRating?: number;
  audiobookProgress?: number;
  publishedDate?: string;
  categories?: string[];
  language?: string;
  pageCount?: number;
  seriesName?: string;
  seriesNumber?: number;
  goodreadsReviewCount?: number;
}

function book({
  id = 1,
  readStatus = ReadStatus.UNSET,
  personalRating,
  audiobookProgress,
  publishedDate,
  categories,
  language,
  pageCount,
  seriesName,
  seriesNumber,
  goodreadsReviewCount,
}: BookOptions = {}): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus,
    personalRating,
    metadata: {
      bookId: id,
      title: `Book ${id}`,
      publishedDate,
      categories,
      language,
      pageCount,
      seriesName,
      seriesNumber,
      goodreadsReviewCount,
      allMetadataLocked: false,
    },
    audiobookProgress: audiobookProgress === undefined
      ? undefined
      : {
        positionMs: 1,
        trackIndex: 0,
        trackPositionMs: 1,
        percentage: audiobookProgress,
      },
  };
}
