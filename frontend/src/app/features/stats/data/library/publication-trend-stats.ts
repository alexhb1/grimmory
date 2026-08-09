import { type BookSummary } from '../../../book/data/book-response.models';
import { firstMaximumBy } from '../first-maximum';
import {
  extractPublicationYear,
  findBusiestYearWindow,
  type PublicationYearCount,
} from './publication-year';

const RECENT_SPAN_YEARS = 10;
const PRODUCTIVE_SPAN_YEARS = 5;
const CLASSIC_YEAR_LIMIT = 1970;
const MODERN_YEAR_START = 2000;

export function calculatePublicationTrendStats(
  books: readonly BookSummary[],
  currentDate = new Date(),
) {
  const currentYear = currentDate.getUTCFullYear();
  const yearCounts = new Map<number, number>();
  let totalBooks = 0;

  for (const book of books) {
    const year = extractPublicationYear(book.metadata?.publishedDate, currentYear);
    if (year === null) continue;

    yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
    totalBooks += 1;
  }

  if (totalBooks === 0) {
    return { totalBooks: 0, firstYear: null, lastYear: null, years: [], insights: null };
  }

  const activeYears: readonly PublicationYearCount[] = [...yearCounts.entries()]
    .map(([year, bookCount]) => ({ year, bookCount }))
    .sort((left, right) => left.year - right.year);
  const firstYear = activeYears[0].year;
  const lastYear = activeYears[activeYears.length - 1].year;
  const years: PublicationYearCount[] = [];

  for (let year = firstYear; year <= lastYear; year += 1) {
    years.push({ year, bookCount: yearCounts.get(year) ?? 0 });
  }

  let recentBookCount = 0;
  let classicBookCount = 0;
  let modernBookCount = 0;

  for (const { year, bookCount } of activeYears) {
    if (year >= currentYear - (RECENT_SPAN_YEARS - 1) && year <= currentYear) {
      recentBookCount += bookCount;
    }
    if (year < CLASSIC_YEAR_LIMIT) classicBookCount += bookCount;
    if (year >= MODERN_YEAR_START) modernBookCount += bookCount;
  }

  return {
    totalBooks,
    firstYear,
    lastYear,
    years,
    insights: {
      peakYear: firstMaximumBy(activeYears, (year) => year.bookCount),
      recentBookCount,
      recentPercent: toPercent(recentBookCount, totalBooks),
      averageBooksPerActiveYear: Number((totalBooks / activeYears.length).toFixed(1)),
      busiestSpan: findBusiestYearWindow(activeYears, PRODUCTIVE_SPAN_YEARS),
      yearSpan: lastYear - firstYear,
      activeYearCount: activeYears.length,
      classicBookCount,
      classicPercent: toPercent(classicBookCount, totalBooks),
      modernBookCount,
      modernPercent: toPercent(modernBookCount, totalBooks),
    },
  };
}

export type PublicationTrendStats = ReturnType<typeof calculatePublicationTrendStats>;

function toPercent(count: number, total: number): number {
  return Math.round((count / total) * 100);
}
