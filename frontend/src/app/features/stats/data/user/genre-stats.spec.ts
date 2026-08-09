import { describe, expect, it } from 'vitest';

import { mapGenreStats } from './genre-stats';

describe('mapGenreStats', () => {
  it('orders genres by reading duration and caps the result', () => {
    const response = Array.from({ length: 40 }, (_, index) => ({
      genre: `Genre ${index}`,
      totalDurationSeconds: index,
    }));

    const stats = mapGenreStats(response);

    expect(stats.rows).toHaveLength(35);
    expect(stats.rows[0]).toEqual({ genre: 'Genre 39', totalDurationSeconds: 39 });
    expect(stats.rows.at(-1)).toEqual({ genre: 'Genre 5', totalDurationSeconds: 5 });
    expect(response[0].genre).toBe('Genre 0');
  });

  it('uses genre name to resolve ties at the result limit', () => {
    const response = Array.from({ length: 36 }, (_, index) => ({
      genre: `Genre ${String(index).padStart(2, '0')}`,
      totalDurationSeconds: 60,
    }));

    const forwards = mapGenreStats(response);
    const backwards = mapGenreStats([...response].reverse());

    expect(backwards).toEqual(forwards);
    expect(forwards.rows).toHaveLength(35);
    expect(forwards.rows.at(-1)?.genre).toBe('Genre 34');
  });
});
