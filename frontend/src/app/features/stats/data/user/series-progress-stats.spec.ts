import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateSeriesProgressStats } from './series-progress-stats';

type SeriesProgressBook = Parameters<typeof calculateSeriesProgressStats>[0][number];

describe('calculateSeriesProgressStats', () => {
  it('classifies an entirely paused series as paused', () => {
    const book: SeriesProgressBook = {
      id: 1,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.PAUSED,
      metadata: {
        bookId: 1,
        title: 'Book 1',
        seriesName: 'Series',
        allMetadataLocked: false,
      },
    };

    expect(calculateSeriesProgressStats([book]).series[0].status).toBe('paused');
  });

  it('returns every series state and coherent summary counts', () => {
    const books = [
      seriesBook(1, 'Active', ReadStatus.READING),
      seriesBook(2, 'Paused', ReadStatus.PAUSED),
      seriesBook(3, 'New', ReadStatus.UNREAD),
      seriesBook(4, 'Done', ReadStatus.READ, 8),
      seriesBook(5, 'Stopped', ReadStatus.ABANDONED),
    ];

    const stats = calculateSeriesProgressStats(books);

    expect(Object.fromEntries(stats.series.map(({ name, status }) => [name, status]))).toEqual({
      Active: 'in-progress',
      Paused: 'paused',
      New: 'not-started',
      Done: 'completed',
      Stopped: 'abandoned',
    });
    expect(stats.completedCount).toBe(1);
    expect(stats.inProgressCount).toBe(1);
    expect(stats.notStartedCount).toBe(1);
    expect(stats.highestRated?.name).toBe('Done');
  });

  it('uses series name to resolve equal status and ownership counts', () => {
    const books = [
      seriesBook(1, 'Zebra', ReadStatus.UNREAD),
      seriesBook(2, 'Alpha', ReadStatus.UNREAD),
    ];

    const forwards = calculateSeriesProgressStats(books);
    const backwards = calculateSeriesProgressStats([...books].reverse());

    expect(backwards).toEqual(forwards);
    expect(forwards.series.map(({ name }) => name)).toEqual(['Alpha', 'Zebra']);
  });

  it('orders numbered books before unnumbered books without a numeric sentinel', () => {
    const books = [
      seriesBook(1, 'Series', ReadStatus.UNREAD, undefined, 1000, 'Position 1000'),
      seriesBook(2, 'Series', ReadStatus.UNREAD, undefined, undefined, 'Unnumbered'),
      seriesBook(3, 'Series', ReadStatus.UNREAD, undefined, 999, 'Position 999'),
    ];

    const forwards = calculateSeriesProgressStats(books);
    const backwards = calculateSeriesProgressStats([...books].reverse());

    expect(backwards).toEqual(forwards);
    expect(forwards.series[0].nextUnread).toBe('Position 999');
  });

  it('normalizes series names and ignores invalid personal ratings', () => {
    const stats = calculateSeriesProgressStats([
      seriesBook(1, ' Series ', ReadStatus.READ, 8),
      seriesBook(2, 'Series', ReadStatus.READ, 0),
      seriesBook(3, 'Series', ReadStatus.READ, 11),
    ]);

    expect(stats.series).toHaveLength(1);
    expect(stats.series[0]).toMatchObject({
      name: 'Series',
      booksOwned: 3,
      averagePersonalRating: 8,
    });
  });
});

function seriesBook(
  id: number,
  seriesName: string,
  readStatus: ReadStatus,
  personalRating?: number,
  seriesNumber?: number,
  title = `Book ${id}`,
): SeriesProgressBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus,
    personalRating,
    metadata: {
      bookId: id,
      title,
      seriesName,
      seriesNumber,
      allMetadataLocked: false,
    },
  };
}
