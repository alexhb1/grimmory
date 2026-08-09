import { describe, expect, it } from 'vitest';

import { mapSessionTimeline } from './reading-session-timeline-stats';

describe('reading session timeline stats', () => {
  it('uses the reported duration for the end and geometry', () => {
    const result = mapSessionTimeline([{
      bookId: 12,
      bookTitle: 'Night Reading',
      bookType: 'EPUB',
      startDate: '2026-01-05T03:30:00',
      totalDurationSeconds: 1800,
    }], 2026, 2);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      dayIndex: 0,
      startHour: 3.5,
      endHour: 4,
      durationMinutes: 30,
    });
  });

  it('splits sessions at midnight before assigning overlap lanes', () => {
    const result = mapSessionTimeline([
      {
        bookId: 12,
        bookTitle: 'Night Reading',
        bookType: 'EPUB',
        startDate: '2026-01-05T23:30:00',
        totalDurationSeconds: 7200,
      },
      {
        bookId: 13,
        bookTitle: 'Late Reading',
        bookType: 'PDF',
        startDate: '2026-01-06T00:30:00',
        totalDurationSeconds: 1800,
      },
    ], 2026, 2);

    expect(result.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ dayIndex: 0, startHour: 23.5, endHour: 24, durationMinutes: 30 }),
      expect.objectContaining({
        dayIndex: 1,
        startHour: 0,
        endHour: 1.5,
        durationMinutes: 90,
        lane: 0,
        laneCount: 2,
      }),
      expect.objectContaining({
        dayIndex: 1,
        startHour: 0.5,
        endHour: 1,
        lane: 1,
        laneCount: 2,
      }),
    ]));
  });

});
