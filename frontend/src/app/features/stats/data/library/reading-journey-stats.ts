import { type BookSummary } from '../../../book/data/book-response.models';

const MILLISECONDS_PER_DAY = 86_400_000;

interface ReadingJourneyMonth {
  readonly month: string;
  readonly addedCount: number;
  readonly finishedCount: number;
  readonly cumulativeAdded: number;
  readonly cumulativeFinished: number;
  readonly backlog: number;
}

export function calculateReadingJourneyStats(
  books: readonly BookSummary[],
  currentDate = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
) {
  const monthFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  });
  const monthlyAdded = new Map<number, number>();
  const monthlyFinished = new Map<number, number>();
  const monthlyTrackedFinished = new Map<number, number>();
  const addedDates = new Map<number, Date>();
  const finishedDates = new Map<number, Date>();
  const completedAddedBookIds = new Set<number>();

  for (const book of books) {
    const addedDate = parseDate(book.addedOn, currentDate);
    if (addedDate) {
      addedDates.set(book.id, addedDate);
      increment(monthlyAdded, monthOrdinal(addedDate, monthFormatter));
    }

    const finishedDate = book.readStatus === 'READ'
      ? parseDate(book.dateFinished, currentDate)
      : null;
    if (finishedDate) {
      finishedDates.set(book.id, finishedDate);
      const finishedMonth = monthOrdinal(finishedDate, monthFormatter);
      increment(monthlyFinished, finishedMonth);

      if (addedDate) {
        completedAddedBookIds.add(book.id);
        increment(
          monthlyTrackedFinished,
          Math.max(finishedMonth, monthOrdinal(addedDate, monthFormatter)),
        );
      }
    }
  }

  const eventMonths = [...new Set([...monthlyAdded.keys(), ...monthlyFinished.keys()])].sort();
  const firstMonth = eventMonths[0] ?? null;
  const lastMonth = eventMonths.at(-1) ?? null;

  if (firstMonth === null || lastMonth === null) {
    return {
      months: [],
      insights: null,
    };
  }

  let cumulativeAdded = 0;
  let cumulativeFinished = 0;
  let cumulativeTrackedFinished = 0;
  const months = monthRange(firstMonth, lastMonth).map<ReadingJourneyMonth>((ordinal) => {
    const addedCount = monthlyAdded.get(ordinal) ?? 0;
    const finishedCount = monthlyFinished.get(ordinal) ?? 0;
    cumulativeAdded += addedCount;
    cumulativeFinished += finishedCount;
    cumulativeTrackedFinished += monthlyTrackedFinished.get(ordinal) ?? 0;

    return {
      month: monthKey(ordinal),
      addedCount,
      finishedCount,
      cumulativeAdded,
      cumulativeFinished,
      backlog: cumulativeAdded - cumulativeTrackedFinished,
    };
  });
  const resultMonths = months.map(({
    month,
    cumulativeAdded,
    cumulativeFinished,
    backlog,
  }) => ({ month, cumulativeAdded, cumulativeFinished, backlog }));

  const currentBacklog = addedDates.size - completedAddedBookIds.size;
  const averageDaysToFinish = calculateAverageDaysToFinish(addedDates, finishedDates);
  const currentMonth = monthOrdinal(currentDate, monthFormatter);
  const recentStartMonth = currentMonth - 2;

  return {
    months: resultMonths,
    insights: {
      totalAdded: addedDates.size,
      totalFinished: finishedDates.size,
      currentBacklog,
      backlogPercent: addedDates.size > 0
        ? Math.round((currentBacklog / addedDates.size) * 100)
        : 0,
      averageDaysToFinish,
      bestReadingMonth: peakMonth(months, (month) => month.finishedCount),
      peakAcquisitionMonth: peakMonth(months, (month) => month.addedCount),
      averageFinishedPerMonth: Number((finishedDates.size / months.length).toFixed(1)),
      recentFinishedCount: [...finishedDates.values()].filter(
        (date) => {
          const month = monthOrdinal(date, monthFormatter);
          return month >= recentStartMonth && month <= currentMonth;
        },
      ).length,
      longestReadingStreak: longestStreak(months),
    },
  };
}

export type ReadingJourneyStats = ReturnType<typeof calculateReadingJourneyStats>;

function parseDate(value: string | undefined, currentDate: Date): Date | null {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date > currentDate ? null : date;
}

function monthOrdinal(date: Date, formatter: Intl.DateTimeFormat): number {
  const { year, month } = yearMonth(date, formatter);
  return year * 12 + month - 1;
}

function yearMonth(
  date: Date,
  formatter: Intl.DateTimeFormat,
): { readonly year: number; readonly month: number } {
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return { year, month };
}

function increment(counts: Map<number, number>, month: number): void {
  counts.set(month, (counts.get(month) ?? 0) + 1);
}

function monthRange(firstMonth: number, lastMonth: number): readonly number[] {
  return Array.from({ length: lastMonth - firstMonth + 1 }, (_, index) => firstMonth + index);
}

function monthKey(ordinal: number): string {
  const year = Math.floor(ordinal / 12);
  const month = ordinal % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function calculateAverageDaysToFinish(
  addedDates: ReadonlyMap<number, Date>,
  finishedDates: ReadonlyMap<number, Date>,
): number | null {
  let totalMilliseconds = 0;
  let count = 0;

  for (const [bookId, finishedDate] of finishedDates) {
    const addedDate = addedDates.get(bookId);
    if (!addedDate || finishedDate < addedDate) continue;

    totalMilliseconds += finishedDate.getTime() - addedDate.getTime();
    count += 1;
  }

  return count > 0 ? Math.round(totalMilliseconds / count / MILLISECONDS_PER_DAY) : null;
}

function peakMonth(
  months: readonly ReadingJourneyMonth[],
  value: (month: ReadingJourneyMonth) => number,
) {
  let peak: { month: string; count: number } | null = null;

  for (const month of months) {
    const count = value(month);
    if (count > (peak?.count ?? 0)) {
      peak = { month: month.month, count };
    }
  }

  return peak;
}

function longestStreak(months: readonly ReadingJourneyMonth[]): number {
  let longest = 0;
  let current = 0;

  for (const month of months) {
    current = month.finishedCount > 0 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }

  return longest;
}
