import {
  type BookSummary,
  type KnownBookReadStatus,
} from '../../../book/data/book-response.models';
import { bookReadStatus } from '../book-stats';

export function calculateReadStatusStats(books: readonly BookSummary[]) {
  const counts = new Map<KnownBookReadStatus, number>();

  for (const book of books) {
    const status = bookReadStatus(book);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  const slices = [...counts.entries()]
    .map(([status, bookCount]) => ({ status, bookCount }))
    .sort((left, right) =>
      right.bookCount - left.bookCount || left.status.localeCompare(right.status));

  return { slices };
}

export type ReadStatusStats = ReturnType<typeof calculateReadStatusStats>;
