import { type BookSummary } from '../../../book/data/book-response.models';

export function calculateLibrarySummaryStats(
  books: readonly BookSummary[],
) {
  const authors = new Set<string>();
  const series = new Set<string>();
  const publishers = new Set<string>();
  let totalSizeKb = 0;

  for (const book of books) {
    totalSizeKb += book.primaryFile?.fileSizeKb ?? 0;

    for (const author of book.metadata?.authors ?? []) addTrimmed(authors, author);
    addTrimmed(series, book.metadata?.seriesName);
    addTrimmed(publishers, book.metadata?.publisher);
  }

  return {
    totalBooks: books.length,
    totalSizeKb,
    totalAuthors: authors.size,
    totalSeries: series.size,
    totalPublishers: publishers.size,
  };
}

function addTrimmed(values: Set<string>, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) values.add(trimmed);
}
