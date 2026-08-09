import { type BookSummary } from '../../../book/data/book-response.models';

const METADATA_SCORE_RANGES = [
  { id: 'excellent', minimum: 90 },
  { id: 'good', minimum: 70 },
  { id: 'fair', minimum: 50 },
  { id: 'poor', minimum: 25 },
  { id: 'veryPoor', minimum: 0 },
] as const;

type MetadataScoreRangeId = (typeof METADATA_SCORE_RANGES)[number]['id'];

export function calculateMetadataScoreStats(books: readonly BookSummary[]) {
  const counts = new Map<MetadataScoreRangeId, number>(
    METADATA_SCORE_RANGES.map((range) => [range.id, 0]),
  );
  let totalBooks = 0;

  for (const book of books) {
    const score = book.metadataMatchScore;
    if (score == null || score < 0 || score > 100) continue;

    totalBooks += 1;
    const range = METADATA_SCORE_RANGES.find(({ minimum }) => score >= minimum);
    if (!range) continue;

    counts.set(range.id, (counts.get(range.id) ?? 0) + 1);
  }

  return {
    totalBooks,
    buckets: METADATA_SCORE_RANGES.map(({ id }) => ({
      id,
      bookCount: counts.get(id) ?? 0,
    })),
  };
}

export type MetadataScoreStats = ReturnType<typeof calculateMetadataScoreStats>;
