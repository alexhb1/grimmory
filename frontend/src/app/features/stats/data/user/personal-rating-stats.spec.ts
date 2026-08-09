import { describe, expect, it } from 'vitest';

import { calculatePersonalRatingStats } from './personal-rating-stats';

type PersonalRatingBook = Parameters<typeof calculatePersonalRatingStats>[0][number];

describe('calculatePersonalRatingStats', () => {
  it('returns all ten rating buckets and excludes invalid ratings', () => {
    const stats = calculatePersonalRatingStats([
      book(1, 1),
      book(2, 10),
      book(3, 10),
      book(4, 0),
      book(5, 10.5),
    ]);

    expect(stats.totalRatedBooks).toBe(3);
    expect(stats.buckets).toHaveLength(10);
    expect(stats.buckets.find(({ rating }) => rating === 1)?.bookCount).toBe(1);
    expect(stats.buckets.find(({ rating }) => rating === 10)?.bookCount).toBe(2);
  });
});

function book(id: number, personalRating: number): PersonalRatingBook {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    personalRating,
  };
}
