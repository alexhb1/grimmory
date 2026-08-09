import { type BookSummary } from '../../../book/data/book-response.models';
import { bookReadStatus } from '../book-stats';
import { firstMaximumBy } from '../first-maximum';

export type SeriesProgressStatus =
  | 'in-progress'
  | 'paused'
  | 'not-started'
  | 'completed'
  | 'abandoned';

interface SeriesProgressSeries {
  readonly name: string;
  readonly booksOwned: number;
  readonly booksRead: number;
  readonly booksReading: number;
  readonly booksPartiallyRead: number;
  readonly booksPaused: number;
  readonly booksAbandoned: number;
  readonly booksWontRead: number;
  readonly booksUnread: number;
  readonly completionPercent: number;
  readonly averagePersonalRating: number | null;
  readonly nextUnread: string | null;
  readonly status: SeriesProgressStatus;
}

interface SeriesAccumulator {
  booksRead: number;
  booksReading: number;
  booksPartiallyRead: number;
  booksPaused: number;
  booksAbandoned: number;
  booksWontRead: number;
  booksUnread: number;
  ratingSum: number;
  ratingCount: number;
  nextUnread: string | null;
}

const STATUS_ORDER: Readonly<Record<SeriesProgressStatus, number>> = {
  'in-progress': 0,
  paused: 1,
  'not-started': 2,
  completed: 3,
  abandoned: 4,
};

export function calculateSeriesProgressStats(books: readonly BookSummary[]) {
  const groups = new Map<string, BookSummary[]>();

  for (const book of books) {
    const seriesName = book.metadata?.seriesName?.trim();
    if (!seriesName) continue;

    const group = groups.get(seriesName);
    if (group) {
      group.push(book);
    } else {
      groups.set(seriesName, [book]);
    }
  }

  const series = [...groups.entries()]
    .map(([name, seriesBooks]) => createSeries(name, seriesBooks))
    .sort(
      (left, right) =>
        STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
        || right.booksOwned - left.booksOwned
        || left.name.localeCompare(right.name),
    );

  return {
    series,
    completedCount: series.filter((entry) => entry.status === 'completed').length,
    inProgressCount: series.filter((entry) => entry.status === 'in-progress').length,
    notStartedCount: series.filter((entry) => entry.status === 'not-started').length,
    averageCompletionPercent: series.length > 0
      ? Math.round(
        series.reduce((total, entry) => total + entry.completionPercent, 0) / series.length,
      )
      : 0,
    highestRated: firstMaximumBy(
      series.filter((entry) => entry.averagePersonalRating !== null),
      (entry) => entry.averagePersonalRating ?? 0,
    ),
  };
}

export type SeriesProgressStats = ReturnType<typeof calculateSeriesProgressStats>;

function createSeries(name: string, books: readonly BookSummary[]): SeriesProgressSeries {
  const accumulator: SeriesAccumulator = {
    booksRead: 0,
    booksReading: 0,
    booksPartiallyRead: 0,
    booksPaused: 0,
    booksAbandoned: 0,
    booksWontRead: 0,
    booksUnread: 0,
    ratingSum: 0,
    ratingCount: 0,
    nextUnread: null,
  };

  const sorted = [...books].sort(compareSeriesBooks);

  for (const book of sorted) {
    switch (bookReadStatus(book)) {
      case 'READ':
        accumulator.booksRead += 1;
        break;
      case 'READING':
      case 'RE_READING':
        accumulator.booksReading += 1;
        break;
      case 'PARTIALLY_READ':
        accumulator.booksPartiallyRead += 1;
        rememberNextUnread(accumulator, book);
        break;
      case 'PAUSED':
        accumulator.booksPaused += 1;
        rememberNextUnread(accumulator, book);
        break;
      case 'ABANDONED':
        accumulator.booksAbandoned += 1;
        break;
      case 'WONT_READ':
        accumulator.booksWontRead += 1;
        break;
      case 'UNREAD':
      case 'UNSET':
        accumulator.booksUnread += 1;
        rememberNextUnread(accumulator, book);
        break;
    }

    const personalRating = book.personalRating;
    if (
      personalRating !== undefined
      && personalRating > 0
      && personalRating <= 10
    ) {
      accumulator.ratingSum += personalRating;
      accumulator.ratingCount += 1;
    }
  }

  const booksOwned = books.length;
  const relevantBooks = booksOwned - accumulator.booksWontRead - accumulator.booksAbandoned;

  return {
    name,
    booksOwned,
    booksRead: accumulator.booksRead,
    booksReading: accumulator.booksReading,
    booksPartiallyRead: accumulator.booksPartiallyRead,
    booksPaused: accumulator.booksPaused,
    booksAbandoned: accumulator.booksAbandoned,
    booksWontRead: accumulator.booksWontRead,
    booksUnread: accumulator.booksUnread,
    completionPercent: relevantBooks > 0
      ? Math.round((accumulator.booksRead / relevantBooks) * 100)
      : 0,
    averagePersonalRating: accumulator.ratingCount > 0
      ? accumulator.ratingSum / accumulator.ratingCount
      : null,
    nextUnread: accumulator.nextUnread,
    status: resolveStatus(accumulator, relevantBooks),
  };
}

function compareSeriesBooks(left: BookSummary, right: BookSummary): number {
  const leftPosition = validSeriesPosition(left);
  const rightPosition = validSeriesPosition(right);

  if (leftPosition !== null && rightPosition !== null && leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  if (leftPosition !== null && rightPosition === null) return -1;
  if (leftPosition === null && rightPosition !== null) return 1;

  const titleOrder = bookTitle(left).localeCompare(bookTitle(right));
  return titleOrder || left.id - right.id;
}

function validSeriesPosition(book: BookSummary): number | null {
  const position = book.metadata?.seriesNumber;
  return position ?? null;
}

function bookTitle(book: BookSummary): string {
  return book.metadata?.title ?? book.primaryFile?.fileName ?? '';
}

function rememberNextUnread(accumulator: SeriesAccumulator, book: BookSummary): void {
  accumulator.nextUnread ??= book.metadata?.title ?? book.primaryFile?.fileName ?? null;
}

function resolveStatus(accumulator: SeriesAccumulator, relevantBooks: number): SeriesProgressStatus {
  if (accumulator.booksRead === relevantBooks && relevantBooks > 0) return 'completed';
  if (accumulator.booksReading > 0) return 'in-progress';
  if (accumulator.booksPaused > 0) return 'paused';
  if (accumulator.booksRead > 0 || accumulator.booksPartiallyRead > 0) return 'in-progress';
  if (accumulator.booksAbandoned > 0 || accumulator.booksWontRead > 0) return 'abandoned';
  return 'not-started';
}
