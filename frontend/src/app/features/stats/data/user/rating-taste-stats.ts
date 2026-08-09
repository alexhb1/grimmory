import { type BookSummary } from '../../../book/data/book-response.models';

export type RatingTasteQuadrantId =
  | 'hidden-gems'
  | 'popular-favorites'
  | 'overrated'
  | 'agreed-misses';

type RatingTasteProfileId = 'unique-taste' | 'balanced' | 'mainstream';

const RATING_TASTE_QUADRANTS: readonly RatingTasteQuadrantId[] = [
  'hidden-gems',
  'popular-favorites',
  'overrated',
  'agreed-misses',
];

const RATING_MIDPOINT = 3;

export function calculateRatingTasteStats(books: readonly BookSummary[]) {
  const rated = books.flatMap((book) => {
    const personalRating = book.personalRating;
    if (personalRating == null
      || personalRating <= 0
      || personalRating > 10) return [];

    const externalRating = resolveExternalRating(book);
    if (externalRating <= 0) return [];

    const normalizedRating = personalRating / 2;
    return [{
      id: book.id,
      title: book.metadata?.title || book.primaryFile?.fileName || '',
      personalRating,
      normalizedRating,
      externalRating,
      quadrant: resolveQuadrant(normalizedRating, externalRating),
    }];
  });

  const totalRatedBooks = rated.length;
  if (totalRatedBooks === 0) {
    return {
      totalRatedBooks: 0,
      averageDeviation: 0,
      profile: 'mainstream' as const,
      books: [],
      quadrants: [],
    };
  }

  const totalDeviation = rated.reduce(
    (total, entry) => total + Math.abs(entry.normalizedRating - entry.externalRating),
    0,
  );

  return {
    totalRatedBooks,
    averageDeviation: totalDeviation / totalRatedBooks,
    profile: ratingTasteProfile(totalDeviation / totalRatedBooks),
    books: rated,
    quadrants: RATING_TASTE_QUADRANTS.map((id) => {
      const bookCount = rated.filter((entry) => entry.quadrant === id).length;
      return { id, bookCount, sharePercent: Math.round((bookCount / totalRatedBooks) * 100) };
    }),
  };
}

function ratingTasteProfile(averageDeviation: number): RatingTasteProfileId {
  if (averageDeviation > 1) return 'unique-taste';
  if (averageDeviation <= 0.5) return 'mainstream';
  return 'balanced';
}

export type RatingTasteStats = ReturnType<typeof calculateRatingTasteStats>;

function resolveQuadrant(normalizedRating: number, externalRating: number): RatingTasteQuadrantId {
  if (normalizedRating >= RATING_MIDPOINT) {
    return externalRating >= RATING_MIDPOINT ? 'popular-favorites' : 'hidden-gems';
  }

  return externalRating >= RATING_MIDPOINT ? 'overrated' : 'agreed-misses';
}

function resolveExternalRating(book: BookSummary): number {
  const metadata = book.metadata;
  if (!metadata) return 0;

  const ratings = [
    metadata.goodreadsRating,
    metadata.amazonRating,
    metadata.hardcoverRating,
    metadata.ranobedbRating,
  ].filter((rating): rating is number =>
    rating != null && rating > 0 && rating <= 5,
  );

  if (ratings.length > 0) {
    return ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
  }

  const fallback = metadata.rating;
  return fallback != null && fallback > 0 && fallback <= 5
    ? fallback
    : 0;
}
