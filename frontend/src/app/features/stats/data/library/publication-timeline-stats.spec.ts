import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculatePublicationTimelineStats } from './publication-timeline-stats';

type PublicationTimelineBook = Parameters<typeof calculatePublicationTimelineStats>[0][number];

describe('calculatePublicationTimelineStats', () => {
  it('keeps pre-1900 publications in one aggregate bucket', () => {
    const stats = calculatePublicationTimelineStats(
      [book(1, '1818'), book(2, '1851'), book(3, '1897'), book(4, '1901')],
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(stats.decades).toEqual([
      { kind: 'pre-1900', startYear: null, bookCount: 3 },
      { kind: 'decade', startYear: 1900, bookCount: 1 },
    ]);
  });

  it('averages the middle pair for an even-sized median', () => {
    const stats = calculatePublicationTimelineStats(
      [book(1, '2000'), book(2, '2001')],
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(stats.insights?.medianYear).toBe(2000.5);
  });

  it('leaves missing titles for the renderer to localize', () => {
    const stats = calculatePublicationTimelineStats(
      [book(1, '2000')],
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(stats.insights?.oldestBook?.title).toBeNull();
    expect(stats.insights?.newestBook?.title).toBeNull();
  });

  it('resolves oldest and newest year ties by title then book ID', () => {
    const stats = calculatePublicationTimelineStats(
      [
        book(4, '2000', 'Beta'),
        book(3, '2000', 'Alpha'),
        book(2, '2000', 'Alpha'),
      ],
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(stats.insights?.oldestBook).toEqual({ title: 'Alpha', year: 2000 });
    expect(stats.insights?.newestBook).toEqual({ title: 'Alpha', year: 2000 });
    expect(stats.insights?.oldestBook).not.toHaveProperty('id');
    expect(stats.insights?.newestBook).not.toHaveProperty('id');
  });
});

function book(
  id: number,
  publishedDate: string,
  title?: string,
): PublicationTimelineBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    readStatus: ReadStatus.UNREAD,
    metadata: {
      bookId: id,
      publishedDate,
      title,
      allMetadataLocked: false,
    },
  };
}
