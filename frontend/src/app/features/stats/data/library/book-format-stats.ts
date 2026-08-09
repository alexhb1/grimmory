import { type BookSummary } from '../../../book/data/book-response.models';

export function calculateBookFormatStats(books: readonly BookSummary[]) {
  const counts = new Map<string | null, number>();

  for (const book of books) {
    const format = book.isPhysical
      ? 'PHYSICAL'
      : book.primaryFile?.bookType ?? null;
    counts.set(format, (counts.get(format) ?? 0) + 1);
  }

  return {
    totalBooks: books.length,
    formats: [...counts.entries()]
      .map(([format, bookCount]) => ({ format, bookCount }))
      .sort((left, right) =>
        right.bookCount - left.bookCount
          || (left.format ?? '').localeCompare(right.format ?? '')),
  };
}

export type BookFormatStats = ReturnType<typeof calculateBookFormatStats>;
