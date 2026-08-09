import { type BookSummary } from '../../../book/data/book-response.models';
import { extractPublicationYear } from '../library/publication-year';
import { bookProgress, bookReadStatus } from '../book-stats';

type ReadingHabitLevel = 'low' | 'mid' | 'high';

const READING_HABIT_IDS = [
  'consistency',
  'multitasking',
  'completionism',
  'exploration',
  'organization',
  'intensity',
  'methodology',
  'momentum',
] as const;

export type ReadingHabitId = (typeof READING_HABIT_IDS)[number];

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
const RECENT_ACTIVITY_MONTHS = 6;
const DEEP_DIVE_MINIMUM_BOOKS = 3;
const FOCUSED_GENRE_MINIMUM_BOOKS = 5;
const LOW_LEVEL_MAXIMUM = 33;
const MID_LEVEL_MAXIMUM = 67;

export function calculateReadingHabitsStats(
  books: readonly BookSummary[],
  calculationDate = new Date(),
) {
  if (books.length === 0) return [];

  const scores: Readonly<Record<ReadingHabitId, number>> = {
    consistency: consistencyScore(books, calculationDate),
    multitasking: multitaskingScore(books),
    completionism: completionismScore(books),
    exploration: explorationScore(books, calculationDate.getFullYear()),
    organization: organizationScore(books),
    intensity: intensityScore(books),
    methodology: methodologyScore(books, calculationDate),
    momentum: momentumScore(books, calculationDate),
  };

  return READING_HABIT_IDS.map((id) => ({
    id,
    score: scores[id],
    level: levelFor(scores[id]),
  }));
}

export type ReadingHabitsStats = ReturnType<typeof calculateReadingHabitsStats>;

function consistencyScore(books: readonly BookSummary[], calculationDate: Date): number {
  const finishedTimes = books
    .flatMap((book) => {
      if (book.readStatus !== 'READ') return [];

      const finishedTime = validTimestamp(book.dateFinished, calculationDate.getTime());
      return finishedTime === null ? [] : [finishedTime];
    })
    .sort((left, right) => left - right);

  if (finishedTimes.length < 3) return Math.min(20, finishedTimes.length * 10);

  const gaps: number[] = [];
  for (let index = 1; index < finishedTimes.length; index++) {
    gaps.push((finishedTimes[index] - finishedTimes[index - 1]) / MILLISECONDS_PER_DAY);
  }

  const meanGap = gaps.reduce((total, gap) => total + gap, 0) / gaps.length;
  if (meanGap === 0) return 50;

  const variance = gaps.reduce((total, gap) => total + (gap - meanGap) ** 2, 0) / gaps.length;
  const coefficientOfVariation = Math.sqrt(variance) / meanGap;

  const regularityScore = Math.max(0, Math.min(70, (1 - coefficientOfVariation / 2) * 70));
  const volumeBonus = Math.min(30, finishedTimes.length * 1.5);

  return Math.min(100, Math.round(regularityScore + volumeBonus));
}

function multitaskingScore(books: readonly BookSummary[]): number {
  const activeCount = books.filter((book) => isActive(book)).length;
  const activeScore = Math.min(
    75,
    activeCount <= 1 ? activeCount * 10 : 10 + (activeCount - 1) * 20,
  );

  const partialCount = books.filter((book) => {
    if (isActive(book) || book.readStatus === 'READ') return false;

    const progress = bookProgress(book);
    return progress > 10 && progress < 90;
  }).length;

  return Math.min(100, Math.round(activeScore + Math.min(25, partialCount * 5)));
}

function completionismScore(books: readonly BookSummary[]): number {
  const startedCount = books.filter(
    (book) =>
      book.readStatus === 'READ'
      || book.readStatus === 'ABANDONED'
      || isActive(book)
      || bookProgress(book) > 0,
  ).length;

  if (startedCount === 0) return 0;

  const completedCount = books.filter((book) => book.readStatus === 'READ').length;
  const abandonedCount = books.filter((book) => book.readStatus === 'ABANDONED').length;

  const completionScore = (completedCount / startedCount) * 75;
  const loyaltyScore = (1 - abandonedCount / startedCount) * 25;

  return Math.min(100, Math.round(completionScore + loyaltyScore));
}

function explorationScore(books: readonly BookSummary[], currentYear: number): number {
  const authors = new Set<string>();
  const languages = new Set<string>();
  const years: number[] = [];
  for (const book of books) {
    for (const author of book.metadata?.authors ?? []) {
      authors.add(author.toLowerCase());
    }
    if (book.metadata?.language) languages.add(book.metadata.language);
    if (book.metadata?.publishedDate) {
      const year = extractPublicationYear(book.metadata.publishedDate, currentYear);
      if (year !== null) years.push(year);
    }
  }

  const diversityScore = Math.min(60, (authors.size / Math.max(1, books.length)) * 60);
  const temporalScore = years.length >= 2
    ? Math.min(25, (Math.max(...years) - Math.min(...years)) * 0.5)
    : 0;
  const languageScore = Math.min(15, Math.max(0, languages.size - 1) * 7.5);

  return Math.min(100, Math.round(diversityScore + temporalScore + languageScore));
}

function organizationScore(books: readonly BookSummary[]): number {
  const completedBooks = books.filter((book) => book.readStatus === 'READ');
  const ratedCompletedCount = completedBooks.filter((book) => book.personalRating).length;
  const ratingRate = completedBooks.length > 0 ? ratedCompletedCount / completedBooks.length : 0;

  const statusSetCount = books.filter(
    (book) => bookReadStatus(book) !== 'UNSET',
  ).length;

  const seriesBooks = books.filter((book) => book.metadata?.seriesName);
  const numberedSeriesCount = seriesBooks.filter((book) => book.metadata?.seriesNumber).length;
  const seriesRate = seriesBooks.length > 0 ? numberedSeriesCount / seriesBooks.length : 1;

  return Math.min(
    100,
    Math.round(ratingRate * 40 + (statusSetCount / books.length) * 35 + seriesRate * 25),
  );
}

function intensityScore(books: readonly BookSummary[]): number {
  const booksWithPages = books.filter((book) => (book.metadata?.pageCount ?? 0) > 0);
  if (booksWithPages.length === 0) return 0;

  const averagePages = booksWithPages.reduce(
    (total, book) => total + (book.metadata?.pageCount ?? 0),
    0,
  ) / booksWithPages.length;
  const lengthScore = Math.min(60, averagePages / 10);

  const deepReadCount = books.filter((book) => bookProgress(book) > 75).length;
  const progressScore = Math.min(40, (deepReadCount / books.length) * 40);

  return Math.min(100, Math.round(lengthScore + progressScore));
}

function methodologyScore(books: readonly BookSummary[], calculationDate: Date): number {
  const calculationTime = calculationDate.getTime();
  const seriesGroups = new Map<string, BookSummary[]>();
  for (const book of books) {
    if (!book.metadata?.seriesName || !book.metadata.seriesNumber) continue;

    const name = book.metadata.seriesName.toLowerCase();
    const group = seriesGroups.get(name);
    if (group) {
      group.push(book);
    } else {
      seriesGroups.set(name, [book]);
    }
  }

  let orderedSeries = 0;
  let multiBookSeries = 0;
  for (const group of seriesGroups.values()) {
    const completed = group.filter(
      (book) => validTimestamp(book.dateFinished, calculationTime) !== null,
    );
    if (completed.length < 2) continue;
    multiBookSeries += 1;

    const sorted = [...completed].sort(
      (left, right) => (left.metadata?.seriesNumber ?? 0) - (right.metadata?.seriesNumber ?? 0),
    );
    const datesInOrder = sorted.every((book, index) => {
      if (index === 0) return true;

      const finishedTime = validTimestamp(book.dateFinished, calculationTime);
      const previousFinishedTime = validTimestamp(sorted[index - 1].dateFinished, calculationTime);

      return finishedTime !== null
        && previousFinishedTime !== null
        && finishedTime >= previousFinishedTime;
    });

    if (datesInOrder) orderedSeries += 1;
  }

  const orderScore = multiBookSeries > 0 ? (orderedSeries / multiBookSeries) * 50 : 25;

  const authorCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  for (const book of books) {
    const authors = new Set((book.metadata?.authors ?? []).map(normalizedValue).filter(Boolean));
    for (const name of authors) {
      authorCounts.set(name, (authorCounts.get(name) ?? 0) + 1);
    }
    const categories = new Set(
      (book.metadata?.categories ?? []).map(normalizedValue).filter(Boolean),
    );
    for (const name of categories) {
      genreCounts.set(name, (genreCounts.get(name) ?? 0) + 1);
    }
  }

  const deepDiveAuthors = [...authorCounts.values()].filter(
    (count) => count >= DEEP_DIVE_MINIMUM_BOOKS,
  ).length;
  const focusedGenres = [...genreCounts.values()].filter(
    (count) => count >= FOCUSED_GENRE_MINIMUM_BOOKS,
  ).length;

  return Math.min(
    100,
    Math.round(orderScore + Math.min(30, deepDiveAuthors * 10) + Math.min(20, focusedGenres * 5)),
  );
}

function momentumScore(books: readonly BookSummary[], calculationDate: Date): number {
  const recentThreshold = new Date(calculationDate.getTime());
  recentThreshold.setMonth(recentThreshold.getMonth() - RECENT_ACTIVITY_MONTHS);
  const recentThresholdTime = recentThreshold.getTime();
  const calculationTime = calculationDate.getTime();

  const recentCompletions = books.filter(
    (book) => {
      if (book.readStatus !== 'READ') return false;

      const finishedTime = validTimestamp(book.dateFinished);
      return finishedTime !== null
        && finishedTime > recentThresholdTime
        && finishedTime <= calculationTime;
    },
  ).length;
  const activeCount = books.filter((book) => isActive(book)).length;
  const almostDoneCount = books.filter((book) => {
    const progress = bookProgress(book);
    return progress > 70 && progress < 100 && book.readStatus !== 'READ';
  }).length;

  return Math.min(
    100,
    Math.round(
      Math.min(45, recentCompletions * 7.5)
        + Math.min(30, activeCount * 10)
        + Math.min(25, almostDoneCount * 8),
    ),
  );
}

function isActive(book: BookSummary): boolean {
  return book.readStatus === 'READING' || book.readStatus === 'RE_READING';
}

function validTimestamp(
  value: string | undefined,
  maximum = Number.POSITIVE_INFINITY,
): number | null {
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= maximum ? timestamp : null;
}

function normalizedValue(value: string): string {
  return value.trim().toLowerCase();
}

function levelFor(score: number): ReadingHabitLevel {
  if (score < LOW_LEVEL_MAXIMUM) return 'low';
  return score < MID_LEVEL_MAXIMUM ? 'mid' : 'high';
}
