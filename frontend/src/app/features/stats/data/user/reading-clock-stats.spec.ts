import { describe, expect, it } from 'vitest';

import { peakHoursQuery } from './peak-hours-stats';
import { mapReadingClockStats, readingClockQuery } from './reading-clock-stats';

describe('mapReadingClockStats', () => {
  it('keeps an empty response distinct from recorded zero activity', () => {
    expect(mapReadingClockStats([]).peakHourOfDay).toBeNull();
    const recorded = mapReadingClockStats([
      { hourOfDay: 8, sessionCount: 1, totalDurationSeconds: 0 },
    ]);

    expect(recorded.minutesByHour).toHaveLength(24);
    expect(recorded.peakHourOfDay).toBeNull();
  });
});

describe('readingClockQuery', () => {
  it('shares the all-time peak-hours response cache', () => {
    const http = {} as never;

    expect(readingClockQuery(http).queryKey).toEqual(
      peakHoursQuery(http, { year: null, month: null }).queryKey,
    );
  });
});
