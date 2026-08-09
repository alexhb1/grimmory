import { type BookSummary } from '../../../book/data/book-response.models';

const PERSONAL_RATING_VALUES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function calculatePersonalRatingStats(books: readonly BookSummary[]) {
  const counts = new Map<number, number>(PERSONAL_RATING_VALUES.map((rating) => [rating, 0]));
  let totalRatedBooks = 0;

  for (const book of books) {
    const rating = book.personalRating;
    if (rating == null || rating <= 0) continue;
    if (!counts.has(rating)) continue;

    counts.set(rating, (counts.get(rating) ?? 0) + 1);
    totalRatedBooks += 1;
  }

  return {
    totalRatedBooks,
    buckets: PERSONAL_RATING_VALUES.map((rating) => ({
      rating,
      bookCount: counts.get(rating) ?? 0,
    })),
  };
}

export type PersonalRatingStats = ReturnType<typeof calculatePersonalRatingStats>;
