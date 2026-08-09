import { type BookSummary } from '../../../book/data/book-response.models';

const MAX_VISIBLE_LANGUAGES = 15;

export function calculateLanguageStats(books: readonly BookSummary[]) {
  const counts = new Map<string, number>();

  for (const book of books) {
    const languageId = book.metadata?.language?.trim().toLowerCase();
    if (!languageId) continue;

    counts.set(languageId, (counts.get(languageId) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .map(([languageId, bookCount]) => ({ languageId, bookCount }))
    .sort((left, right) =>
      right.bookCount - left.bookCount || left.languageId.localeCompare(right.languageId));
  const totalBooks = ranked.reduce((total, language) => total + language.bookCount, 0);

  return {
    totalBooks,
    languages: ranked.slice(0, MAX_VISIBLE_LANGUAGES),
  };
}

export type LanguageStats = ReturnType<typeof calculateLanguageStats>;
