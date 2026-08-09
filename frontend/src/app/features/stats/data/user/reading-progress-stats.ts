import { type BookSummary } from '../../../book/data/book-response.models';
import { bookProgress } from '../book-stats';

const READING_PROGRESS_BANDS = [
  { id: 'not-started', maximum: 0 },
  { id: 'just-started', maximum: 25 },
  { id: 'getting-into-it', maximum: 50 },
  { id: 'halfway-through', maximum: 75 },
  { id: 'almost-finished', maximum: 100 },
  { id: 'completed', maximum: Number.POSITIVE_INFINITY },
] as const;

export type ReadingProgressBandId = (typeof READING_PROGRESS_BANDS)[number]['id'];

export function calculateReadingProgressStats(books: readonly BookSummary[]) {
  const counts = new Map<ReadingProgressBandId, number>(
    READING_PROGRESS_BANDS.map((band) => [band.id, 0]),
  );
  let totalBooks = 0;

  for (const book of books) {
    const progress = bookProgress(book);
    const band = progress === 100
      ? READING_PROGRESS_BANDS.at(-1)
      : READING_PROGRESS_BANDS.find(({ maximum }) => progress <= maximum);
    if (!band) continue;

    counts.set(band.id, (counts.get(band.id) ?? 0) + 1);
    totalBooks += 1;
  }

  return {
    totalBooks,
    bands: READING_PROGRESS_BANDS.map(({ id }) => ({
      id,
      bookCount: counts.get(id) ?? 0,
    })),
  };
}

export type ReadingProgressStats = ReturnType<typeof calculateReadingProgressStats>;
