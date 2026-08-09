import { type BookSummary } from '../../../book/data/book-response.models';
import { bookProgress } from '../book-stats';

interface ReadingSurvivalPoint {
  readonly threshold: number;
  readonly survivalPercent: number;
}

const SURVIVAL_THRESHOLDS: readonly number[] = [0, 10, 25, 50, 75, 90, 100];

export function calculateReadingSurvivalStats(books: readonly BookSummary[]) {
  const progresses = books
    .map((book) => bookProgress(book))
    .filter((progress) => progress > 0);
  const totalStarted = progresses.length;

  if (totalStarted === 0) {
    return {
      totalStarted: 0,
      points: [],
      completionRate: 0,
      medianDropout: null,
      dangerZone: null,
    };
  }

  const points = SURVIVAL_THRESHOLDS.map<ReadingSurvivalPoint>((threshold) => {
    const survivingBooks = progresses.filter((progress) => progress >= threshold).length;
    return {
      threshold,
      survivalPercent: (survivingBooks / totalStarted) * 100,
    };
  });

  return {
    totalStarted,
    points,
    completionRate: Math.round(points[points.length - 1].survivalPercent),
    medianDropout: findMedianDropout(points),
    dangerZone: findDangerZone(points),
  };
}

export type ReadingSurvivalStats = ReturnType<typeof calculateReadingSurvivalStats>;

function findMedianDropout(points: readonly ReadingSurvivalPoint[]) {
  const index = points.findIndex((point) => point.survivalPercent < 50);
  if (index === -1) return null;

  const to = points[index].threshold;
  return { from: index === 0 ? to : points[index - 1].threshold, to };
}

function findDangerZone(
  points: readonly ReadingSurvivalPoint[],
) {
  let dangerZone: { from: number; to: number; dropPercent: number } | null = null;

  for (let index = 1; index < points.length; index += 1) {
    const drop = points[index - 1].survivalPercent - points[index].survivalPercent;
    if (drop <= 0 || (dangerZone && drop <= dangerZone.dropPercent)) continue;

    dangerZone = {
      from: points[index - 1].threshold,
      to: points[index].threshold,
      dropPercent: drop,
    };
  }

  return dangerZone;
}
