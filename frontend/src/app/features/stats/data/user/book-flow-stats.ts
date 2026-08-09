import { type BookSummary } from '../../../book/data/book-response.models';
import { bookReadStatus } from '../book-stats';

export type BookFlowColumn = 'added' | 'status' | 'rating';

export type BookFlowStatusId = 'read' | 'reading' | 'unread' | 'paused' | 'abandoned' | 'other';

export type BookFlowRatingId = 'high' | 'mid' | 'low' | 'unrated';

export interface BookFlowQuarter {
  readonly year: number;
  readonly quarter: number;
}

export interface BookFlowNode {
  readonly id: string;
  readonly column: BookFlowColumn;
  readonly count: number;
  readonly quarter: BookFlowQuarter | null;
}

const BOOK_FLOW_UNKNOWN_QUARTER_ID = 'unknown';
export const BOOK_FLOW_OTHER_QUARTERS_ID = 'other-quarters';

const QUARTER_LIMIT = 8;

export function calculateBookFlowStats(
  books: readonly BookSummary[],
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
) {
  if (books.length === 0) {
    return {
      nodes: [],
      links: [],
      totalBooks: 0,
      busiestQuarter: null,
      topStatus: null,
      completionPercent: 0,
    } as const;
  }

  const quarterCounts = new Map<string, number>();
  const statusCounts = new Map<BookFlowStatusId, number>();
  const ratingCounts = new Map<BookFlowRatingId, number>();
  const quarterToStatus = new Map<string, Map<BookFlowStatusId, number>>();
  const statusToRating = new Map<BookFlowStatusId, Map<BookFlowRatingId, number>>();
  const quarterFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  });

  for (const book of books) {
    const quarterId = quarterIdOf(book, quarterFormatter);
    const statusId = statusIdOf(book);
    const ratingId = ratingIdOf(book);

    quarterCounts.set(quarterId, (quarterCounts.get(quarterId) ?? 0) + 1);
    statusCounts.set(statusId, (statusCounts.get(statusId) ?? 0) + 1);
    ratingCounts.set(ratingId, (ratingCounts.get(ratingId) ?? 0) + 1);
    increment(quarterToStatus, quarterId, statusId);
    increment(statusToRating, statusId, ratingId);
  }

  const sortedQuarterEntries = [...quarterCounts.entries()]
    .sort(([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId));
  const quarterEntries = sortedQuarterEntries.length <= QUARTER_LIMIT
    ? sortedQuarterEntries
    : [
      ...sortedQuarterEntries.slice(0, QUARTER_LIMIT - 1),
      [
        BOOK_FLOW_OTHER_QUARTERS_ID,
        sortedQuarterEntries
          .slice(QUARTER_LIMIT - 1)
          .reduce((total, [, count]) => total + count, 0),
      ] as const,
    ];
  const visibleQuarterToStatus = new Map<string, Map<BookFlowStatusId, number>>();
  const visibleQuarterIds = new Set(quarterEntries.map(([id]) => id));

  for (const [quarterId, statuses] of quarterToStatus) {
    const visibleId = visibleQuarterIds.has(quarterId)
      ? quarterId
      : BOOK_FLOW_OTHER_QUARTERS_ID;

    for (const [status, count] of statuses) {
      increment(visibleQuarterToStatus, visibleId, status, count);
    }
  }
  const statusEntries = [...statusCounts.entries()]
    .sort(([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId));
  const ratingEntries = [...ratingCounts.entries()]
    .sort(([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId));

  const nodes = [
    ...createNodes(quarterEntries, 'added'),
    ...createNodes(statusEntries, 'status'),
    ...createNodes(ratingEntries, 'rating'),
  ];

  const links = [
    ...createLinks(visibleQuarterToStatus, 'added', 'status'),
    ...createLinks(statusToRating, 'status', 'rating'),
  ];

  const readCount = statusCounts.get('read') ?? 0;

  return {
    nodes,
    links,
    totalBooks: books.length,
    busiestQuarter: parseQuarterId(
      sortedQuarterEntries.find(([id]) => id !== BOOK_FLOW_UNKNOWN_QUARTER_ID)?.[0]
        ?? BOOK_FLOW_UNKNOWN_QUARTER_ID,
    ),
    topStatus: statusEntries[0]?.[0] ?? null,
    completionPercent: Math.round((readCount / books.length) * 100),
  };
}

export type BookFlowStats = ReturnType<typeof calculateBookFlowStats>;

function parseQuarterId(id: string): BookFlowQuarter | null {
  const [year, quarter] = id.split('-Q').map(Number);
  return Number.isFinite(year) && Number.isFinite(quarter) ? { year, quarter } : null;
}

function quarterIdOf(book: BookSummary, formatter: Intl.DateTimeFormat): string {
  if (!book.addedOn) return BOOK_FLOW_UNKNOWN_QUARTER_ID;

  const date = new Date(book.addedOn);
  if (!Number.isFinite(date.getTime())) return BOOK_FLOW_UNKNOWN_QUARTER_ID;

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return `${year}-Q${Math.ceil(month / 3)}`;
}

function statusIdOf(book: BookSummary): BookFlowStatusId {
  switch (bookReadStatus(book)) {
    case 'READ':
      return 'read';
    case 'READING':
    case 'RE_READING':
      return 'reading';
    case 'UNREAD':
    case 'UNSET':
      return 'unread';
    case 'PAUSED':
      return 'paused';
    case 'ABANDONED':
    case 'WONT_READ':
      return 'abandoned';
    case 'PARTIALLY_READ':
      return 'other';
  }
}

function ratingIdOf(book: BookSummary): BookFlowRatingId {
  const rating = book.personalRating;
  if (!rating || rating <= 0) return 'unrated';

  const normalized = rating / 2;
  if (normalized >= 4) return 'high';
  return normalized >= 3 ? 'mid' : 'low';
}

function increment<TKey, TInner>(
  groups: Map<TKey, Map<TInner, number>>,
  key: TKey,
  innerKey: TInner,
  count = 1,
): void {
  let inner = groups.get(key);
  if (!inner) {
    inner = new Map<TInner, number>();
    groups.set(key, inner);
  }

  inner.set(innerKey, (inner.get(innerKey) ?? 0) + count);
}

function createNodes(
  entries: readonly (readonly [string, number])[],
  column: BookFlowColumn,
): BookFlowNode[] {
  return entries.map(([id, count]) => ({
    id,
    column,
    count,
    quarter: column === 'added' ? parseQuarterId(id) : null,
  }));
}

function createLinks<TSource extends string, TTarget extends string>(
  groups: ReadonlyMap<TSource, ReadonlyMap<TTarget, number>>,
  sourceColumn: BookFlowColumn,
  targetColumn: BookFlowColumn,
) {
  return [...groups].flatMap(([sourceId, targets]) =>
    [...targets].map(([targetId, value]) => ({
      sourceId,
      sourceColumn,
      targetId,
      targetColumn,
      value,
    })),
  );
}
