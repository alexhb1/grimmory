import { describe, expect, it } from 'vitest';

import {
  mapReadingStreaks,
  mapSessionHeatmapCalendar,
} from './reading-session-heatmap-stats';

describe('mapReadingStreaks', () => {
  it('uses the previous calendar date for the current streak', () => {
    const stats = mapReadingStreaks(
      [{ date: '2026-03-29', count: 1 }],
      new Date(2026, 2, 30, 0, 30),
    );

    expect(stats.currentStreak).toBe(1);
  });

  it('derives consistency and milestone state from all reading dates', () => {
    const response = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      count: 1,
    }));

    const stats = mapReadingStreaks(response, new Date('2026-01-10T12:00:00Z'));

    expect(stats.consistencyPercent).toBe(70);
    expect(stats.milestones.find(({ id }) => id === '7-day-streak')?.unlocked).toBe(true);
    expect(stats.milestones.find(({ id }) => id === '30-day-streak')?.unlocked).toBe(false);
  });

  it('gives a single reading day a meaningful consistency denominator', () => {
    const stats = mapReadingStreaks(
      [{ date: '2026-01-10', count: 1 }],
      new Date('2026-01-10T12:00:00Z'),
    );

    expect(stats.consistencyPercent).toBe(100);
  });
  it('maps valid transport dates to streak statistics', () => {
    const result = mapReadingStreaks([
      { date: '2024-12-31', count: 2 },
      { date: '2025-01-01', count: 1 },
      { date: 'not-a-date', count: 1 },
    ], new Date('2025-01-02T12:00:00Z'));

    expect(result).toMatchObject({
      hasData: true,
      currentStreak: 2,
      longestStreak: 2,
      totalReadingDays: 2,
    });
  });

  it('ignores dates after the calculation date', () => {
    const result = mapReadingStreaks([
      { date: '2026-01-10', count: 1 },
      { date: '2026-01-11', count: 1 },
    ], new Date('2026-01-10T12:00:00Z'));

    expect(result.totalReadingDays).toBe(1);
  });

  it('does not turn non-positive counts into reading days', () => {
    const result = mapReadingStreaks([
      { date: '2026-01-08', count: 0 },
      { date: '2026-01-09', count: -1 },
      { date: '2026-01-10', count: 1 },
    ], new Date('2026-01-10T12:00:00Z'));

    expect(result.totalReadingDays).toBe(1);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });
});

describe('mapSessionHeatmapCalendar', () => {
  it('maps every day in the selected year to Monday-first calendar coordinates', () => {
    const result = mapSessionHeatmapCalendar(2025, [
      { date: '2025-01-01', count: 2 },
      { date: '2025-12-31', count: 3 },
    ]);

    expect(result.cells).toHaveLength(365);
    expect(result.cells[0]).toEqual({
      week: 0,
      weekday: 2,
      date: '2025-01-01',
      count: 2,
    });
    expect(result.maxCount).toBe(3);
    expect(result.totalSessions).toBe(5);
  });

  it('ignores non-positive session counts', () => {
    const result = mapSessionHeatmapCalendar(2025, [
      { date: '2025-01-01', count: -1 },
      { date: '2025-01-02', count: 0 },
      { date: '2025-01-03', count: 2 },
    ]);

    expect(result.totalSessions).toBe(2);
    expect(result.maxCount).toBe(2);
  });
});
