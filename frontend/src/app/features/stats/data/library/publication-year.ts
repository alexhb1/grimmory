const EARLIEST_PUBLICATION_YEAR = 1000;
const YEAR_PATTERN = /^(\d{4})(?:$|-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01])(?:T.*)?)?$)/;

export interface PublicationYearCount {
  readonly year: number;
  readonly bookCount: number;
}

interface PublicationYearWindow {
  readonly startYear: number;
  readonly endYear: number;
  readonly bookCount: number;
}

export function extractPublicationYear(
  publishedDate: string | undefined,
  currentYear: number,
): number | null {
  if (!publishedDate) return null;

  const match = YEAR_PATTERN.exec(publishedDate);
  if (!match) return null;

  const year = Number(match[1]);
  return year >= EARLIEST_PUBLICATION_YEAR && year <= currentYear + 1 ? year : null;
}

export function findBusiestYearWindow(
  years: readonly PublicationYearCount[],
  spanInYears: number,
): PublicationYearWindow | null {
  let best: PublicationYearWindow | null = null;
  let windowStart = 0;
  let windowCount = 0;

  for (const entry of years) {
    windowCount += entry.bookCount;

    while (entry.year - years[windowStart].year > spanInYears - 1) {
      windowCount -= years[windowStart].bookCount;
      windowStart += 1;
    }

    if (windowCount > (best?.bookCount ?? 0)) {
      const startYear = years[windowStart].year;
      best = {
        startYear,
        endYear: startYear + spanInYears - 1,
        bookCount: windowCount,
      };
    }
  }

  return best;
}
