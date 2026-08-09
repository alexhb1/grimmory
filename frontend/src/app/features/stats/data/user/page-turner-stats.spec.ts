import { describe, expect, it } from 'vitest';

import { mapPageTurnerStats } from './page-turner-stats';

type PageTurnerResponse = Parameters<typeof mapPageTurnerStats>[0][number];

describe('mapPageTurnerStats', () => {
  it('maps trends and identifies the established guilty-pleasure threshold', () => {
    const stats = mapPageTurnerStats([
      response(1, { gripScore: 60, personalRating: 3, sessionAcceleration: 6, gapReduction: -3 }),
      response(2, { gripScore: 59, personalRating: 2, sessionAcceleration: -6, gapReduction: 3 }),
    ]);

    expect(stats.ranking[0]).toMatchObject({ sessionTrend: 'increasing', gapTrend: 'shrinking' });
    expect(stats.ranking[1]).toMatchObject({ sessionTrend: 'decreasing', gapTrend: 'growing' });
    expect(stats.guiltyPleasure?.bookId).toBe(1);
    expect(stats.averageGripScore).toBe(60);
  });
});

function response(
  bookId: number,
  values: Partial<PageTurnerResponse>,
): PageTurnerResponse {
  return {
    bookId,
    bookTitle: `Book ${bookId}`,
    personalRating: null,
    gripScore: 0,
    totalSessions: 3,
    avgSessionDurationSeconds: 1200,
    sessionAcceleration: 0,
    gapReduction: 0,
    finishBurst: false,
    ...values,
  };
}
