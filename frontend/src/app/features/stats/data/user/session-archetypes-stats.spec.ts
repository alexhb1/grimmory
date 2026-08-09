import { describe, expect, it } from 'vitest';

import { mapSessionArchetypeStats } from './session-archetypes-stats';

describe('session archetype stats', () => {
  it.each([
    [5, 4, 'night', 'morning'],
    [12, 11, 'morning', 'afternoon'],
    [17, 16, 'afternoon', 'evening'],
    [22, 21, 'evening', 'night'],
  ] as const)(
    'changes classification at the %i:00 boundary',
    (boundary, precedingHour, precedingArchetype, boundaryArchetype) => {
      const before = mapSessionArchetypeStats([
        { hourOfDay: precedingHour, durationMinutes: 10, dayOfWeek: 1 },
      ]);
      const atBoundary = mapSessionArchetypeStats([
        { hourOfDay: boundary, durationMinutes: 10, dayOfWeek: 1 },
      ]);

      expect(before.dominantArchetype).toBe(precedingArchetype);
      expect(atBoundary.dominantArchetype).toBe(boundaryArchetype);
    },
  );

  it('returns null when the highest archetype count is tied', () => {
    const result = mapSessionArchetypeStats([
      { hourOfDay: 8, durationMinutes: 10, dayOfWeek: 1 },
      { hourOfDay: 18, durationMinutes: 10, dayOfWeek: 2 },
    ]);

    expect(result.dominantArchetype).toBeNull();
  });

  it('returns the only archetype with the highest count', () => {
    const result = mapSessionArchetypeStats([
      { hourOfDay: 8, durationMinutes: 10, dayOfWeek: 1 },
      { hourOfDay: 9, durationMinutes: 10, dayOfWeek: 2 },
      { hourOfDay: 18, durationMinutes: 10, dayOfWeek: 3 },
    ]);

    expect(result.dominantArchetype).toBe('morning');
  });

  it('keeps fractional hours returned by the session endpoint', () => {
    const result = mapSessionArchetypeStats([
      { hourOfDay: 8.5, durationMinutes: 30, dayOfWeek: 1 },
    ]);

    expect(result.sessionCount).toBe(1);
    expect(result.days[0]?.points).toEqual([
      { hourOfDay: 8.5, durationMinutes: 30 },
    ]);
    expect(result.dominantArchetype).toBe('morning');
  });

  it('excludes malformed sessions from points, totals, and classification', () => {
    const result = mapSessionArchetypeStats([
      { hourOfDay: -1, durationMinutes: 10, dayOfWeek: 1 },
      { hourOfDay: 8, durationMinutes: -1, dayOfWeek: 1 },
      { hourOfDay: 8, durationMinutes: 10, dayOfWeek: 0 },
      { hourOfDay: 8, durationMinutes: 10, dayOfWeek: 1 },
    ]);

    expect(result.sessionCount).toBe(1);
    expect(result.days).toEqual([{
      dayOfWeek: 1,
      points: [{ hourOfDay: 8, durationMinutes: 10 }],
    }]);
    expect(result.dominantArchetype).toBe('morning');
  });

  it('keeps longer sessions in the result', () => {
    const response: Parameters<typeof mapSessionArchetypeStats>[0] = [
      { hourOfDay: 8, durationMinutes: 10, dayOfWeek: 1 },
      { hourOfDay: 9, durationMinutes: 10, dayOfWeek: 2 },
      { hourOfDay: 10, durationMinutes: 10, dayOfWeek: 3 },
      { hourOfDay: 11, durationMinutes: 10, dayOfWeek: 4 },
      { hourOfDay: 20, durationMinutes: 31, dayOfWeek: 5 },
    ];

    const result = mapSessionArchetypeStats(response);

    expect(result.sessionCount).toBe(5);
    expect(result.days.flatMap((day) => day.points.map((point) => point.durationMinutes))).toContain(
      31,
    );
  });
});
