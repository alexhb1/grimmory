import { type BookSummary } from '../../../book/data/book-response.models';
import { firstMaximumBy } from '../first-maximum';
import {
  extractPublicationYear,
  findBusiestYearWindow,
  type PublicationYearCount,
} from './publication-year';

const GOLDEN_ERA_SPAN_YEARS = 20;
const RARE_DECADE_LIMIT = 3;

type PublicationTimelineDecade = {
  readonly kind: 'pre-1900';
  readonly startYear: null;
  readonly bookCount: number;
} | {
  readonly kind: 'decade';
  readonly startYear: number;
  readonly bookCount: number;
};

interface PublicationTimelineBook {
  readonly title: string | null;
  readonly year: number;
}

interface PublicationTimelineCandidate extends PublicationTimelineBook {
  readonly id: number;
}

export function calculatePublicationTimelineStats(
  books: readonly BookSummary[],
  currentDate = new Date(),
) {
  const currentYear = currentDate.getUTCFullYear();
  const yearCounts = new Map<number, number>();
  const decadeCounts = new Map<number | null, number>();
  const years: number[] = [];

  let oldestBook: PublicationTimelineCandidate | null = null;
  let newestBook: PublicationTimelineCandidate | null = null;
  let yearTotal = 0;

  for (const book of books) {
    const year = extractPublicationYear(book.metadata?.publishedDate, currentYear);
    if (year === null) continue;

    const title = book.metadata?.title || null;
    years.push(year);
    yearTotal += year;
    yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);

    const decadeStart = year < 1900 ? null : Math.floor(year / 10) * 10;
    decadeCounts.set(decadeStart, (decadeCounts.get(decadeStart) ?? 0) + 1);

    const candidate = { id: book.id, title, year };
    if (!oldestBook
      || year < oldestBook.year
      || (year === oldestBook.year && comparePublicationBooks(candidate, oldestBook) < 0)) {
      oldestBook = candidate;
    }
    if (!newestBook
      || year > newestBook.year
      || (year === newestBook.year && comparePublicationBooks(candidate, newestBook) < 0)) {
      newestBook = candidate;
    }
  }

  if (!oldestBook || !newestBook) {
    return { totalBooks: 0, decades: [], insights: null };
  }

  years.sort((left, right) => left - right);
  const decades = [...decadeCounts.entries()]
    .map(([startYear, bookCount]): PublicationTimelineDecade => startYear === null
      ? { kind: 'pre-1900', startYear, bookCount }
      : { kind: 'decade', startYear, bookCount })
    .sort((left, right) => (left.startYear ?? Number.NEGATIVE_INFINITY)
      - (right.startYear ?? Number.NEGATIVE_INFINITY));
  const yearRows: readonly PublicationYearCount[] = [...yearCounts.entries()]
    .map(([year, bookCount]) => ({ year, bookCount }))
    .sort((left, right) => left.year - right.year);
  const rareBookCount = decades
    .filter((decade) => decade.bookCount < RARE_DECADE_LIMIT)
    .reduce((total, decade) => total + decade.bookCount, 0);

  return {
    totalBooks: years.length,
    decades,
    insights: {
      oldestBook: toPublicationTimelineBook(oldestBook),
      newestBook: toPublicationTimelineBook(newestBook),
      averageYear: Math.round(yearTotal / years.length),
      medianYear: median(years),
      yearSpan: years[years.length - 1] - years[0],
      peakDecade: firstMaximumBy(decades, (decade) => decade.bookCount),
      goldenEra: findBusiestYearWindow(yearRows, GOLDEN_ERA_SPAN_YEARS),
      mostCommonYear: firstMaximumBy(yearRows, (year) => year.bookCount),
      rarityPercent: Math.round((rareBookCount / years.length) * 100),
    },
  };
}

export type PublicationTimelineStats = ReturnType<typeof calculatePublicationTimelineStats>;

function comparePublicationBooks(
  left: PublicationTimelineCandidate,
  right: PublicationTimelineCandidate,
): number {
  return (left.title ?? '').localeCompare(right.title ?? '')
    || left.id - right.id;
}

function toPublicationTimelineBook(
  book: PublicationTimelineCandidate,
): PublicationTimelineBook {
  return { title: book.title, year: book.year };
}

function median(sortedYears: readonly number[]): number {
  const middle = Math.floor(sortedYears.length / 2);
  return sortedYears.length % 2 === 0
    ? (sortedYears[middle - 1] + sortedYears[middle]) / 2
    : sortedYears[middle];
}
