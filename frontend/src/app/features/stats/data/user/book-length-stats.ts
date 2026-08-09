import {
  type BookSummary,
  type KnownBookReadStatus,
} from '../../../book/data/book-response.models';
import { bookReadStatus } from '../book-stats';

export type BookLengthStatusGroup = 'read' | 'reading' | 'abandoned' | 'other';

interface BookLengthPoint {
  readonly title: string;
  readonly pageCount: number;
  readonly personalRating: number;
  readonly group: BookLengthStatusGroup;
}

interface BookLengthRange {
  readonly minimum: number;
  readonly maximum: number | null;
}

const BOOK_LENGTH_STATUS_GROUPS: readonly BookLengthStatusGroup[] = [
  'read',
  'reading',
  'abandoned',
  'other',
];

const BOOK_LENGTH_RANGES: readonly BookLengthRange[] = [
  { minimum: 0, maximum: 100 },
  { minimum: 101, maximum: 200 },
  { minimum: 201, maximum: 300 },
  { minimum: 301, maximum: 400 },
  { minimum: 401, maximum: 500 },
  { minimum: 501, maximum: null },
];

export function calculateBookLengthStats(books: readonly BookSummary[]) {
  const points: BookLengthPoint[] = [];

  for (const book of books) {
    const personalRating = book.personalRating;
    const pageCount = book.metadata?.pageCount;
    if (
      personalRating == null
      || personalRating <= 0
      || personalRating > 10
    ) continue;
    if (pageCount == null || pageCount <= 0) continue;

    points.push({
      title: book.metadata?.title || book.primaryFile?.fileName || '',
      pageCount,
      personalRating,
      group: resolveStatusGroup(bookReadStatus(book)),
    });
  }

  if (points.length === 0) {
    return {
      totalRatedBooks: 0,
      points: [],
      groups: [],
      sweetSpot: null,
      highestRatedLength: null,
      trendLine: null,
    };
  }

  return {
    totalRatedBooks: points.length,
    points,
    groups: BOOK_LENGTH_STATUS_GROUPS.filter((group) =>
      points.some((point) => point.group === group),
    ),
    sweetSpot: findSweetSpot(points),
    highestRatedLength: findHighestRatedLength(points),
    trendLine: findTrendLine(points),
  };
}

export type BookLengthStats = ReturnType<typeof calculateBookLengthStats>;

function resolveStatusGroup(status: KnownBookReadStatus): BookLengthStatusGroup {
  switch (status) {
    case 'READ':
    case 'PARTIALLY_READ':
      return 'read';
    case 'READING':
    case 'RE_READING':
      return 'reading';
    case 'ABANDONED':
    case 'WONT_READ':
      return 'abandoned';
    case 'UNREAD':
    case 'PAUSED':
    case 'UNSET':
      return 'other';
  }
}

function findSweetSpot(points: readonly BookLengthPoint[]) {
  let sweetSpot: (BookLengthRange & { averageRating: number }) | null = null;

  for (const range of BOOK_LENGTH_RANGES) {
    const inRange = points.filter(
      (point) =>
        point.pageCount >= range.minimum &&
        (range.maximum === null || point.pageCount <= range.maximum),
    );
    if (inRange.length < 2) continue;

    const averageRating =
      inRange.reduce((total, point) => total + point.personalRating, 0) / inRange.length;
    if (sweetSpot && averageRating <= sweetSpot.averageRating) continue;

    sweetSpot = {
      minimum: range.minimum,
      maximum: range.maximum,
      averageRating,
    };
  }

  return sweetSpot;
}

function findHighestRatedLength(points: readonly BookLengthPoint[]): number {
  return points.reduce((highest, point) => {
    if (point.personalRating > highest.personalRating) return point;
    if (
      point.personalRating === highest.personalRating
      && point.pageCount < highest.pageCount
    ) return point;
    return highest;
  }).pageCount;
}

function findTrendLine(points: readonly BookLengthPoint[]) {
  if (points.length < 2) return null;

  const pointCount = points.length;
  let totalPageCount = 0;
  let totalRating = 0;
  let totalProduct = 0;
  let totalSquaredPageCount = 0;

  for (const point of points) {
    totalPageCount += point.pageCount;
    totalRating += point.personalRating;
    totalProduct += point.pageCount * point.personalRating;
    totalSquaredPageCount += point.pageCount ** 2;
  }

  const denominator = pointCount * totalSquaredPageCount - totalPageCount ** 2;
  if (denominator === 0) return null;

  const slope = (pointCount * totalProduct - totalPageCount * totalRating) / denominator;
  const intercept = (totalRating - slope * totalPageCount) / pointCount;
  const minimumPageCount = Math.min(...points.map((point) => point.pageCount));
  const maximumPageCount = Math.max(...points.map((point) => point.pageCount));

  const ratingAt = (pageCount: number) =>
    Math.max(0, Math.min(10, slope * pageCount + intercept));

  return [
    { pageCount: minimumPageCount, personalRating: ratingAt(minimumPageCount) },
    { pageCount: maximumPageCount, personalRating: ratingAt(maximumPageCount) },
  ] as const;
}
