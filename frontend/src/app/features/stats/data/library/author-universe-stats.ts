import { type BookSummary } from '../../../book/data/book-response.models';
import { firstMaximumBy } from '../first-maximum';

interface AuthorUniverseAuthor {
  readonly name: string;
  readonly bookCount: number;
  readonly readCount: number;
  readonly totalPages: number;
  readonly averageRating: number;
  readonly completionPercent: number;
  readonly topGenres: readonly string[];
}

interface AuthorAccumulator {
  readonly genres: Map<string, number>;
  readonly bookIds: Set<number>;
  bookCount: number;
  readCount: number;
  totalPages: number;
  pageCountCount: number;
  ratingSum: number;
  ratingCount: number;
}

const MINIMUM_BOOKS_PER_AUTHOR = 2;
const AUTHOR_LIMIT = 50;
const GENRE_LIMIT = 5;
const HIDDEN_GEM_MAXIMUM_BOOKS = 3;
const HIDDEN_GEM_MINIMUM_RATING = 4;
const LONGEST_READS_MINIMUM_PAGES = 300;
const CONCENTRATION_MINIMUM_PERCENT = 25;
const BACKLOG_MINIMUM_BOOKS = 2;
const COMPLETION_MINIMUM_BOOKS = 3;
const VERSATILE_MINIMUM_GENRES = 3;

export function calculateAuthorUniverseStats(books: readonly BookSummary[]) {
  const accumulators = new Map<string, AuthorAccumulator>();
  let totalPages = 0;
  let readPages = 0;

  for (const book of books) {
    const authors = uniqueValues(book.metadata?.authors ?? []);
    if (authors.length === 0) continue;

    const rating = bookRating(book);
    const storedPageCount = book.metadata?.pageCount;
    const pageCount = storedPageCount !== undefined
      && storedPageCount > 0
      ? storedPageCount
      : 0;
    const isRead = book.readStatus === 'READ';
    const categories = uniqueValues(book.metadata?.categories ?? []);
    totalPages += pageCount;
    if (isRead) readPages += pageCount;

    for (const name of authors) {
      let accumulator = accumulators.get(name);
      if (!accumulator) {
        accumulator = {
          genres: new Map<string, number>(),
          bookIds: new Set<number>(),
          bookCount: 0,
          readCount: 0,
          totalPages: 0,
          pageCountCount: 0,
          ratingSum: 0,
          ratingCount: 0,
        };
        accumulators.set(name, accumulator);
      }

      accumulator.bookCount += 1;
      accumulator.bookIds.add(book.id);
      accumulator.totalPages += pageCount;
      if (pageCount > 0) accumulator.pageCountCount += 1;
      if (isRead) accumulator.readCount += 1;
      if (rating > 0) {
        accumulator.ratingSum += rating;
        accumulator.ratingCount += 1;
      }
      for (const category of categories) {
        accumulator.genres.set(category, (accumulator.genres.get(category) ?? 0) + 1);
      }
    }
  }

  const eligibleAuthors = [...accumulators.entries()]
    .filter(([, accumulator]) => accumulator.bookCount >= MINIMUM_BOOKS_PER_AUTHOR)
    .map(([name, accumulator]) => createAuthor(name, accumulator))
    .sort((left, right) => right.bookCount - left.bookCount || left.name.localeCompare(right.name));
  const authors = eligibleAuthors.slice(0, AUTHOR_LIMIT);

  return {
    authors,
    insights: eligibleAuthors.length > 0
      ? createInsights(eligibleAuthors, accumulators, books.length, totalPages, readPages)
      : null,
  };
}

export type AuthorUniverseStats = ReturnType<typeof calculateAuthorUniverseStats>;

function bookRating(book: BookSummary): number {
  return validRating(book.personalRating, 10) / 2
    || validRating(book.metadata?.goodreadsRating, 5)
    || validRating(book.metadata?.amazonRating, 5)
    || validRating(book.metadata?.hardcoverRating, 5)
    || 0;
}

function validRating(value: number | undefined, maximum: number): number {
  return value !== undefined && value > 0 && value <= maximum
    ? value
    : 0;
}

function createAuthor(name: string, accumulator: AuthorAccumulator): AuthorUniverseAuthor {
  return {
    name,
    bookCount: accumulator.bookCount,
    readCount: accumulator.readCount,
    totalPages: accumulator.totalPages,
    averageRating: accumulator.ratingCount > 0 ? accumulator.ratingSum / accumulator.ratingCount : 0,
    completionPercent: (accumulator.readCount / accumulator.bookCount) * 100,
    topGenres: [...accumulator.genres]
      .sort(([leftName, leftCount], [rightName, rightCount]) =>
        rightCount - leftCount || leftName.localeCompare(rightName))
      .slice(0, GENRE_LIMIT)
      .map(([name]) => name),
  };
}

function createInsights(
  authors: readonly AuthorUniverseAuthor[],
  accumulators: ReadonlyMap<string, AuthorAccumulator>,
  collectionBookCount: number,
  totalPages: number,
  readPages: number,
) {
  const averagePageCount = (author: AuthorUniverseAuthor) => {
    const pageCountCount = accumulators.get(author.name)?.pageCountCount ?? 0;
    return pageCountCount > 0 ? author.totalPages / pageCountCount : 0;
  };
  const rated = authors.filter((author) => author.averageRating > 0);
  const highestRated = firstMaximumBy(rated, (author) => author.averageRating);
  const mostPages = firstMaximumBy(authors, (author) => author.totalPages);
  const bestCompletion = firstMaximumBy(
    authors.filter((author) => author.bookCount >= COMPLETION_MINIMUM_BOOKS),
    (author) => author.completionPercent,
  );
  const hiddenGem = firstMaximumBy(
    rated.filter(
      (author) =>
        author.bookCount <= HIDDEN_GEM_MAXIMUM_BOOKS
        && author.averageRating >= HIDDEN_GEM_MINIMUM_RATING,
    ),
    (author) => author.averageRating,
  );
  const biggestBacklog = firstMaximumBy(
    authors.filter(
      (author) => author.bookCount - author.readCount >= BACKLOG_MINIMUM_BOOKS,
    ),
    (author) => author.bookCount - author.readCount,
  );
  const longestReads = firstMaximumBy(
    authors.filter((author) => averagePageCount(author) >= LONGEST_READS_MINIMUM_PAGES),
    averagePageCount,
  );
  const mostVersatile = firstMaximumBy(
    authors.filter(
      (author) => (accumulators.get(author.name)?.genres.size ?? 0) >= VERSATILE_MINIMUM_GENRES,
    ),
    (author) => accumulators.get(author.name)?.genres.size ?? 0,
  );
  const untouchedAuthor = firstMaximumBy(
    authors.filter((author) => author.completionPercent === 0),
    (author) => author.bookCount,
  );
  const topThreeBookIds = new Set(
    authors.slice(0, 3).flatMap((author) => [...(accumulators.get(author.name)?.bookIds ?? [])]),
  );
  const topThreeSharePercent = authors.length >= 3
    ? Math.round((topThreeBookIds.size / collectionBookCount) * 100)
    : null;

  return {
    mostCollected: { name: authors[0].name, count: authors[0].bookCount },
    highestRated: highestRated
      ? {
        name: highestRated.name,
        averageRating: highestRated.averageRating,
        bookCount: highestRated.bookCount,
      }
      : null,
    mostPages: mostPages && mostPages.totalPages > 0
      ? { name: mostPages.name, count: mostPages.totalPages }
      : null,
    bestCompletion: bestCompletion && bestCompletion.completionPercent > 0
      ? { name: bestCompletion.name, count: Math.round(bestCompletion.completionPercent) }
      : null,
    hiddenGem: hiddenGem
      ? { name: hiddenGem.name, averageRating: hiddenGem.averageRating, bookCount: hiddenGem.bookCount }
      : null,
    biggestBacklog: biggestBacklog
      ? {
        name: biggestBacklog.name,
        count: biggestBacklog.bookCount - biggestBacklog.readCount,
      }
      : null,
    topThreeSharePercent: topThreeSharePercent !== null
      && topThreeSharePercent >= CONCENTRATION_MINIMUM_PERCENT
      ? topThreeSharePercent
      : null,
    longestReads: longestReads
      ? { name: longestReads.name, count: Math.round(averagePageCount(longestReads)) }
      : null,
    mostVersatile: mostVersatile
      ? { name: mostVersatile.name, count: accumulators.get(mostVersatile.name)?.genres.size ?? 0 }
      : null,
    untouchedAuthor: untouchedAuthor
      ? { name: untouchedAuthor.name, count: untouchedAuthor.bookCount }
      : null,
    overallProgressPercent: totalPages > 0 ? Math.round((readPages / totalPages) * 100) : null,
  };
}

function uniqueValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
