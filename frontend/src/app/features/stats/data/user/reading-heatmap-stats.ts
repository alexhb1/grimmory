import { type BookSummary } from '../../../book/data/book-response.models';

const HEATMAP_YEARS = 10;
const MONTHS_PER_YEAR = 12;

export function calculateReadingHeatmapStats(
  books: readonly BookSummary[],
  currentYear = new Date().getFullYear(),
) {
  const years = Array.from(
    { length: HEATMAP_YEARS },
    (_, index) => currentYear - (HEATMAP_YEARS - 1) + index,
  );
  const counts = new Map<string, number>();
  let totalBooks = 0;

  for (const book of books) {
    if (!book.dateFinished) continue;

    const finished = new Date(book.dateFinished);
    if (!Number.isFinite(finished.getTime())) continue;
    const year = finished.getFullYear();
    if (year < years[0] || year > currentYear) continue;

    const key = `${year}-${finished.getMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalBooks += 1;
  }

  const cells = years.flatMap((year, yearIndex) =>
    Array.from({ length: MONTHS_PER_YEAR }, (_, monthIndex) => ({
      yearIndex,
      monthIndex,
      bookCount: counts.get(`${year}-${monthIndex}`) ?? 0,
    })),
  );

  return {
    years,
    cells,
    maximumBookCount: Math.max(1, ...cells.map((cell) => cell.bookCount)),
    totalBooks,
  };
}

export type ReadingHeatmapStats = ReturnType<typeof calculateReadingHeatmapStats>;
