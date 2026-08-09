import { describe, expect, it } from 'vitest';

import { mapFavoriteDays } from './favorite-days-stats';

describe('mapFavoriteDays', () => {
  it('maps one-based weekdays into a complete Monday-first week', () => {
    const stats = mapFavoriteDays([
      { dayOfWeek: 1, sessionCount: 2, totalDurationSeconds: 5400 },
      { dayOfWeek: 7, sessionCount: 1, totalDurationSeconds: 1800 },
    ]);

    expect(stats.days).toHaveLength(7);
    expect(stats.days[0]).toEqual({ dayIndex: 0, sessionCount: 2, durationHours: 1.5 });
    expect(stats.days[6]).toEqual({ dayIndex: 6, sessionCount: 1, durationHours: 0.5 });
    expect(stats.totalSessions).toBe(3);
  });
});
