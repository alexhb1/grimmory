import { type BookSummary } from '../../../book/data/book-response.models';
import { extractPublicationYear } from '../library/publication-year';
import { bookProgress } from '../book-stats';

type ReadingDnaLevel = 'low' | 'mid' | 'high';

const READING_DNA_TRAIT_IDS = [
  'adventurous',
  'perfectionist',
  'intellectual',
  'emotional',
  'patient',
  'social',
  'nostalgic',
  'ambitious',
] as const;

export type ReadingDnaTraitId = (typeof READING_DNA_TRAIT_IDS)[number];

const INTELLECTUAL_GENRES: readonly string[] = [
  'philosophy',
  'history',
  'biography',
  'politics',
  'psychology',
  'economics',
  'mathematics',
  'engineering',
  'medicine',
  'law',
  'education',
  'sociology',
  'nonfiction',
  'non-fiction',
  'academic',
];

const EMOTIONAL_GENRES: readonly string[] = [
  'romance',
  'memoir',
  'poetry',
  'drama',
  'self-help',
  'autobiography',
  'literary fiction',
  'coming of age',
];

const MAINSTREAM_GENRES: readonly string[] = [
  'thriller',
  'mystery',
  'crime',
  'suspense',
  'horror',
  'fantasy',
  'science fiction',
  'adventure',
  'true crime',
  'humor',
  'graphic novel',
  'manga',
  'comic',
];

const CLASSIC_GENRES: readonly string[] = [
  'classic',
  'mythology',
  'folklore',
  'fairy tale',
  'ancient',
  'medieval',
  'victorian',
  'gothic',
];

const CLASSIC_AGE_YEARS = 30;
const LOW_LEVEL_MAXIMUM = 33;
const MID_LEVEL_MAXIMUM = 67;

export function calculateReadingDnaStats(
  books: readonly BookSummary[],
  currentYear = new Date().getFullYear(),
) {
  if (books.length === 0) return [];

  const scores: Readonly<Record<ReadingDnaTraitId, number>> = {
    adventurous: adventurousScore(books),
    perfectionist: perfectionistScore(books),
    intellectual: intellectualScore(books),
    emotional: emotionalScore(books),
    patient: patientScore(books),
    social: socialScore(books),
    nostalgic: nostalgicScore(books, currentYear),
    ambitious: ambitiousScore(books),
  };

  return READING_DNA_TRAIT_IDS.map((id) => ({
      id,
      score: scores[id],
      level: levelFor(scores[id]),
  }));
}

export type ReadingDnaStats = ReturnType<typeof calculateReadingDnaStats>;

function adventurousScore(books: readonly BookSummary[]): number {
  const genres = new Set<string>();
  const languages = new Set<string>();

  for (const book of books) {
    for (const category of book.metadata?.categories ?? []) {
      genres.add(category.toLowerCase());
    }
    if (book.metadata?.language) languages.add(book.metadata.language);
  }

  const diversityRatio = genres.size / Math.max(1, books.length * 0.4);
  const genreScore = Math.min(75, diversityRatio * 75);
  const languageScore = Math.min(25, Math.max(0, languages.size - 1) * 12.5);

  return Math.min(100, Math.round(genreScore + languageScore));
}

function perfectionistScore(books: readonly BookSummary[]): number {
  const completedCount = books.filter((book) => book.readStatus === 'READ').length;
  const completionRate = completedCount / books.length;

  const ratedBooks = books.filter((book) => book.personalRating);
  const highRatedCount = ratedBooks.filter((book) => (book.personalRating ?? 0) >= 8).length;
  const highRatingRate = ratedBooks.length > 0 ? highRatedCount / ratedBooks.length : 0;

  return Math.min(100, Math.round(completionRate * 60 + highRatingRate * 40));
}

function intellectualScore(books: readonly BookSummary[]): number {
  const intellectualCount = books.filter((book) =>
    matchesGenres(book, INTELLECTUAL_GENRES),
  ).length;
  const longCount = books.filter((book) => (book.metadata?.pageCount ?? 0) > 400).length;

  return Math.min(
    100,
    Math.round((intellectualCount / books.length) * 70 + (longCount / books.length) * 30),
  );
}

function emotionalScore(books: readonly BookSummary[]): number {
  const emotionalCount = books.filter((book) => matchesGenres(book, EMOTIONAL_GENRES)).length;
  const ratedCount = books.filter((book) => book.personalRating).length;

  return Math.min(
    100,
    Math.round((emotionalCount / books.length) * 70 + (ratedCount / books.length) * 30),
  );
}

function patientScore(books: readonly BookSummary[]): number {
  const longCount = books.filter((book) => (book.metadata?.pageCount ?? 0) > 500).length;
  const seriesCount = books.filter(
    (book) => book.metadata?.seriesName && book.metadata.seriesNumber,
  ).length;
  const progressCount = books.filter((book) => bookProgress(book) > 50).length;

  return Math.min(
    100,
    Math.round(
      (longCount / books.length) * 40
        + (seriesCount / books.length) * 35
        + (progressCount / books.length) * 25,
    ),
  );
}

function socialScore(books: readonly BookSummary[]): number {
  const mainstreamCount = books.filter((book) => matchesGenres(book, MAINSTREAM_GENRES)).length;
  const popularCount = books.filter((book) => {
    const metadata = book.metadata;
    if (!metadata) return false;
    return (
      (metadata.goodreadsReviewCount != null && metadata.goodreadsReviewCount > 10000)
      || (metadata.amazonReviewCount != null && metadata.amazonReviewCount > 2000)
    );
  }).length;

  return Math.min(
    100,
    Math.round((mainstreamCount / books.length) * 50 + (popularCount / books.length) * 50),
  );
}

function nostalgicScore(books: readonly BookSummary[], currentYear: number): number {
  const classicThreshold = currentYear - CLASSIC_AGE_YEARS;

  const oldCount = books.filter((book) => {
    const publishedDate = book.metadata?.publishedDate;
    if (!publishedDate) return false;

    const publishedYear = extractPublicationYear(publishedDate, currentYear);
    return publishedYear !== null && publishedYear < classicThreshold;
  }).length;
  const classicCount = books.filter((book) => matchesGenres(book, CLASSIC_GENRES)).length;

  return Math.min(
    100,
    Math.round((oldCount / books.length) * 60 + (classicCount / books.length) * 40),
  );
}

function ambitiousScore(books: readonly BookSummary[]): number {
  const volumeScore = Math.min(40, books.length * 0.4);

  const challengingBooks = books.filter((book) => (book.metadata?.pageCount ?? 0) > 600);
  const completedChallenging = challengingBooks.filter(
    (book) => book.readStatus === 'READ',
  );

  const challengingRate = challengingBooks.length / books.length;
  const completionRate = challengingBooks.length > 0
    ? completedChallenging.length / challengingBooks.length
    : 0;

  return Math.min(100, Math.round(volumeScore + challengingRate * 35 + completionRate * 25));
}

function matchesGenres(book: BookSummary, genres: readonly string[]): boolean {
  const categories = book.metadata?.categories;
  if (!categories) return false;

  return categories.some((category) =>
    genres.some((genre) => category.toLowerCase().includes(genre)),
  );
}

function levelFor(score: number): ReadingDnaLevel {
  if (score < LOW_LEVEL_MAXIMUM) return 'low';
  return score < MID_LEVEL_MAXIMUM ? 'mid' : 'high';
}
