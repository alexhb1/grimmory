import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateMetadataScoreStats } from './metadata-score-stats';

type MetadataScoreBook = Parameters<typeof calculateMetadataScoreStats>[0][number];

describe('calculateMetadataScoreStats', () => {
  it('places fractional scores in exhaustive threshold buckets', () => {
    const scores = [24.9, 25, 49.9, 50, 69.9, 70, 89.9, 90];
    const books = scores.map((metadataMatchScore, index): MetadataScoreBook => ({
      id: index + 1,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.UNREAD,
      metadataMatchScore,
    }));

    const stats = calculateMetadataScoreStats(books);

    expect(stats.totalBooks).toBe(scores.length);
    expect(stats.buckets.map(({ bookCount }) => bookCount)).toEqual([1, 2, 2, 2, 1]);
    expect(stats.buckets.reduce((total, { bookCount }) => total + bookCount, 0))
      .toBe(stats.totalBooks);
  });

  it('excludes invalid scores from the total and buckets', () => {
    const stats = calculateMetadataScoreStats([-1, 101].map((metadataMatchScore, index) => ({
      id: index + 1,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.UNREAD,
      metadataMatchScore,
    })));

    expect(stats.totalBooks).toBe(0);
    expect(stats.buckets.every(({ bookCount }) => bookCount === 0)).toBe(true);
  });
});
