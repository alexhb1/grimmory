import { type BookSummary } from '../../../book/data/book-response.models';
import { firstMaximumBy } from '../first-maximum';
import { extractPublicationYear } from '../library/publication-year';

interface PublicationEraDecade {
  readonly startYear: number;
  readonly averageRating: number;
  readonly ratingBands: readonly PublicationEraRatingBand[];
}

interface DecadeAccumulator {
  readonly bucketCounts: number[];
  ratingSum: number;
  bookCount: number;
}

interface PublicationEraRatingBand {
  readonly minimumRating: number;
  readonly maximumRating: number;
  readonly bookCount: number;
}

const RATING_BANDS = [
  { minimumRating: 1, maximumRating: 2 },
  { minimumRating: 3, maximumRating: 4 },
  { minimumRating: 5, maximumRating: 6 },
  { minimumRating: 7, maximumRating: 8 },
  { minimumRating: 9, maximumRating: 10 },
] as const;
const MINIMUM_RATED_BOOKS = 3;
const EARLIEST_YEAR = 1900;

export function calculatePublicationEraStats(
  books: readonly BookSummary[],
  currentYear = new Date().getFullYear(),
) {
  const ratedBooks = books.flatMap((book) => {
    const publishedDate = book.metadata?.publishedDate;
    const rating = book.personalRating;
    if (!publishedDate || rating == null || rating <= 0 || rating > 10) {
      return [];
    }

    const publishedYear = extractPublicationYear(publishedDate, currentYear);
    return publishedYear !== null && publishedYear >= EARLIEST_YEAR
      ? [{ publishedYear, rating }]
      : [];
  });
  if (ratedBooks.length < MINIMUM_RATED_BOOKS) {
    return {
      decades: [] as PublicationEraDecade[],
      ratedBookCount: ratedBooks.length,
      bestDecade: null,
    };
  }

  const accumulators = new Map<number, DecadeAccumulator>();

  for (const { publishedYear, rating } of ratedBooks) {
    const startYear = Math.floor(publishedYear / 10) * 10;
    const bucketIndex = Math.min(RATING_BANDS.length - 1, Math.floor((rating - 1) / 2));

    let accumulator = accumulators.get(startYear);
    if (!accumulator) {
      accumulator = {
        bucketCounts: RATING_BANDS.map(() => 0),
        ratingSum: 0,
        bookCount: 0,
      };
      accumulators.set(startYear, accumulator);
    }

    accumulator.bucketCounts[bucketIndex] += 1;
    accumulator.ratingSum += rating;
    accumulator.bookCount += 1;
  }

  const decades = [...accumulators.entries()]
    .sort(([left], [right]) => left - right)
    .map(([startYear, accumulator]) => ({
      startYear,
      averageRating: accumulator.ratingSum / accumulator.bookCount,
      ratingBands: RATING_BANDS.map((band, index) => ({
        ...band,
        bookCount: accumulator.bucketCounts[index],
      })),
    }));

  return {
    decades,
    ratedBookCount: ratedBooks.length,
    bestDecade: firstMaximumBy(decades, (decade) => decade.averageRating),
  };
}

export type PublicationEraStats = ReturnType<typeof calculatePublicationEraStats>;
