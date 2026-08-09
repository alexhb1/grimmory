import { type BookSummary } from '../../../book/data/book-response.models';

const PAGE_COUNT_BUCKETS = [
  { id: 'up-to-100', minimum: 1, maximum: 100 },
  { id: '101-to-200', minimum: 101, maximum: 200 },
  { id: '201-to-300', minimum: 201, maximum: 300 },
  { id: '301-to-500', minimum: 301, maximum: 500 },
  { id: '501-to-750', minimum: 501, maximum: 750 },
  { id: '751-to-1000', minimum: 751, maximum: 1000 },
  { id: 'over-1000', minimum: 1001, maximum: null },
] as const;

type PageCountBucketId = (typeof PAGE_COUNT_BUCKETS)[number]['id'];

export function calculatePageCountStats(books: readonly BookSummary[]) {
  const counts = new Map<PageCountBucketId, number>(PAGE_COUNT_BUCKETS.map((bucket) => [bucket.id, 0]));
  let totalBooks = 0;

  for (const book of books) {
    const pageCount = book.metadata?.pageCount;
    if (pageCount == null || pageCount <= 0) continue;

    const bucket = PAGE_COUNT_BUCKETS.find(
      ({ minimum, maximum }) => pageCount >= minimum && (maximum === null || pageCount <= maximum),
    );
    if (!bucket) continue;

    counts.set(bucket.id, (counts.get(bucket.id) ?? 0) + 1);
    totalBooks += 1;
  }

  return {
    totalBooks,
    buckets: PAGE_COUNT_BUCKETS.map(({ id, minimum, maximum }) => ({
      id,
      minimum,
      maximum,
      bookCount: counts.get(id) ?? 0,
    })),
  };
}

export type PageCountStats = ReturnType<typeof calculatePageCountStats>;
