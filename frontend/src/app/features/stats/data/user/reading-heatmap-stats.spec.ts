import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateReadingHeatmapStats } from './reading-heatmap-stats';

type ReadingHeatmapBook = Parameters<typeof calculateReadingHeatmapStats>[0][number];

describe('calculateReadingHeatmapStats', () => {
  it('does not count malformed dates outside the rendered cells', () => {
    const book: ReadingHeatmapBook = {
      id: 1,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.READ,
      dateFinished: 'not-a-date',
    };

    const stats = calculateReadingHeatmapStats([book]);

    expect(stats.totalBooks).toBe(0);
    expect(stats.cells.reduce((total, cell) => total + cell.bookCount, 0)).toBe(0);
  });

  it('builds its ten-year window from the supplied year', () => {
    const book: ReadingHeatmapBook = {
      id: 1,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.READ,
      dateFinished: '2030-06-15T12:00:00',
    };

    const stats = calculateReadingHeatmapStats([book], 2030);

    expect(stats.years).toEqual([2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    expect(stats.totalBooks).toBe(1);
  });
});
