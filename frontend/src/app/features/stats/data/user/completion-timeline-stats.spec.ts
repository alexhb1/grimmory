import { describe, expect, it } from 'vitest';

import { mapCompletionTimelineStats } from './completion-timeline-stats';

describe('mapCompletionTimelineStats', () => {
  it('keeps finished and partially read books as distinct domain values', () => {
    const stats = mapCompletionTimelineStats([
      {
        month: 1,
        statusBreakdown: { READ: 1, PARTIALLY_READ: 2 },
        finishedBooks: 1,
      },
    ]);

    expect(stats.months[0]).toEqual({
      month: 1,
      finished: 1,
      partiallyRead: 2,
      activeReading: 0,
      paused: 0,
      discontinued: 0,
    });
    expect(stats.totalBooks).toBe(3);
  });

});
