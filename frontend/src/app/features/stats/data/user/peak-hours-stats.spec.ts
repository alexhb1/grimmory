import { describe, expect, it } from 'vitest';

import { mapPeakHours } from './peak-hours-stats';

describe('mapPeakHours', () => {
  it('maps sparse results into all 24 hours and derives average duration', () => {
    const stats = mapPeakHours([
      { hourOfDay: 23, sessionCount: 2, totalDurationSeconds: 2700 },
    ]);

    expect(stats.hours).toHaveLength(24);
    expect(stats.hours[0]).toEqual({ hour: 0, sessionCount: 0, averageDurationMinutes: 0 });
    expect(stats.hours[23]).toEqual({ hour: 23, sessionCount: 2, averageDurationMinutes: 23 });
    expect(stats.totalSessions).toBe(2);
  });
});
