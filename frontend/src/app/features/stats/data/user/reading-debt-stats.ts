import { type BookSummary } from '../../../book/data/book-response.models';

interface MonthCounts {
  addedCount: number;
  finishedCount: number;
}

type ReadingDebtTrend = 'growing' | 'steady' | 'shrinking';

interface ReadingDebtMonth {
  readonly year: number;
  readonly monthIndex: number;
  readonly addedCount: number;
  readonly finishedCount: number;
  readonly backlog: number;
}

export interface ReadingDebtStats {
  readonly months: readonly ReadingDebtMonth[];
  readonly currentBacklog: number;
  readonly trend: ReadingDebtTrend;
}

const TRACKED_MONTHS = 12;

export function calculateReadingDebtStats(
  books: readonly BookSummary[],
  currentDate = new Date(),
): ReadingDebtStats {
  if (books.length === 0) return { months: [], currentBacklog: 0, trend: 'steady' };

  const now = currentDate;
  const counts = new Map<string, MonthCounts>();
  const window: { year: number; monthIndex: number; key: string }[] = [];

  for (let offset = TRACKED_MONTHS - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = monthKey(date);
    window.push({ year: date.getFullYear(), monthIndex: date.getMonth(), key });
    counts.set(key, { addedCount: 0, finishedCount: 0 });
  }

  const windowStart = new Date(window[0].year, window[0].monthIndex, 1);
  let backlog = 0;

  for (const book of books) {
    const added = parsedDate(book.addedOn);
    if (added && added > currentDate) continue;

    const parsedFinished = parsedDate(book.dateFinished);
    const finished = parsedFinished
      && parsedFinished <= currentDate
      ? added && parsedFinished < added ? added : parsedFinished
      : null;

    if ((!added || added < windowStart) && (!finished || finished >= windowStart)) {
      backlog += 1;
    }

    if (added) {
      const bucket = counts.get(monthKey(added));
      if (bucket) bucket.addedCount += 1;
    }
    if (finished) {
      const bucket = counts.get(monthKey(finished));
      if (bucket) bucket.finishedCount += 1;
    }
  }

  const hasWindowActivity = [...counts.values()].some(
    ({ addedCount, finishedCount }) => addedCount > 0 || finishedCount > 0,
  );
  if (backlog === 0 && !hasWindowActivity) {
    return { months: [], currentBacklog: 0, trend: 'steady' };
  }

  const openingBacklog = backlog;
  const months = window.map(({ year, monthIndex, key }) => {
    const bucket = counts.get(key) ?? { addedCount: 0, finishedCount: 0 };
    backlog += bucket.addedCount - bucket.finishedCount;

    return {
      year,
      monthIndex,
      addedCount: bucket.addedCount,
      finishedCount: bucket.finishedCount,
      backlog,
    };
  });

  return {
    months,
    currentBacklog: backlog,
    trend: backlog > openingBacklog
      ? 'growing'
      : backlog < openingBacklog ? 'shrinking' : 'steady',
  };
}

function parsedDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
