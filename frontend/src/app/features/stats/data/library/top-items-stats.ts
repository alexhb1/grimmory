import {
  type BookSummary,
  type KnownBookReadStatus,
} from '../../../book/data/book-response.models';
import { bookReadStatus } from '../book-stats';

export type TopItemsKind = 'authors' | 'categories' | 'series' | 'publishers' | 'tags' | 'moods';

interface TopItemSegment {
  readonly status: KnownBookReadStatus;
  readonly count: number;
}

interface TopItemRow {
  readonly name: string;
  readonly bookCount: number;
  readonly readCount: number;
  readonly segments: readonly TopItemSegment[];
}

interface TopItemsCompletionLeader {
  readonly name: string;
  readonly readPercent: number;
}

interface TopItemAccumulator {
  readonly statusCounts: Map<KnownBookReadStatus, number>;
  readonly bookIds: Set<number>;
}

const TOP_ITEMS_KINDS: readonly TopItemsKind[] = [
  'authors',
  'categories',
  'series',
  'publishers',
  'tags',
  'moods',
];

const TOP_ITEMS_LIMIT = 15;

const READ_STATUS_ORDER: readonly KnownBookReadStatus[] = [
  'READ',
  'READING',
  'RE_READING',
  'PARTIALLY_READ',
  'PAUSED',
  'UNREAD',
  'WONT_READ',
  'ABANDONED',
  'UNSET',
];

export function calculateTopItemsStats(books: readonly BookSummary[]) {
  const kinds = Object.fromEntries(
    TOP_ITEMS_KINDS.map((kind) => [kind, calculateKindStats(books, kind)]),
  ) as Record<TopItemsKind, ReturnType<typeof calculateKindStats>>;

  return { kinds };
}

export type TopItemsStats = ReturnType<typeof calculateTopItemsStats>;
export type TopItemsKindStats = TopItemsStats['kinds'][TopItemsKind];

function calculateKindStats(books: readonly BookSummary[], kind: TopItemsKind) {
  const accumulators = new Map<string, TopItemAccumulator>();

  for (const book of books) {
    const status = bookReadStatus(book);

    const names = new Set(itemsForKind(book, kind).map((value) => value.trim()).filter(Boolean));
    for (const name of names) {

      let accumulator = accumulators.get(name);
      if (!accumulator) {
        accumulator = { statusCounts: new Map(), bookIds: new Set() };
        accumulators.set(name, accumulator);
      }

      const { statusCounts } = accumulator;
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
      accumulator.bookIds.add(book.id);
    }
  }

  const rankedItems = [...accumulators.entries()]
    .map(([name, { statusCounts }]) => createRow(name, statusCounts))
    .sort((left, right) => right.bookCount - left.bookCount || left.name.localeCompare(right.name));
  const items = rankedItems
    .slice(0, TOP_ITEMS_LIMIT)
    .map(({ name, bookCount, segments }) => ({ name, bookCount, segments }));

  const totalBookCount = rankedItems.reduce((total, item) => total + item.bookCount, 0);
  const topFiveBookIds = new Set(
    items.slice(0, 5).flatMap((item) => [...(accumulators.get(item.name)?.bookIds ?? [])]),
  );

  return {
    items,
    statuses: READ_STATUS_ORDER.filter((status) =>
      items.some((item) => item.segments.some((segment) => segment.status === status)),
    ),
    averageBooksPerItem: rankedItems.length > 0 ? totalBookCount / rankedItems.length : 0,
    topFiveSharePercent: items.length >= 5 && books.length > 0
      ? Math.round((topFiveBookIds.size / books.length) * 100)
      : null,
    mostCompleted: findMostCompleted(rankedItems),
  };
}

function createRow(
  name: string,
  statusCounts: ReadonlyMap<KnownBookReadStatus, number>,
): TopItemRow {
  const segments = READ_STATUS_ORDER.flatMap<TopItemSegment>((status) => {
    const count = statusCounts.get(status) ?? 0;
    return count === 0 ? [] : [{ status, count }];
  });
  const bookCount = segments.reduce((total, segment) => total + segment.count, 0);

  return {
    name,
    bookCount,
    readCount: statusCounts.get('READ') ?? 0,
    segments,
  };
}

function findMostCompleted(items: readonly TopItemRow[]): TopItemsCompletionLeader | null {
  let leader: TopItemRow | null = null;

  for (const item of items) {
    if (item.bookCount < 2) continue;
    if (!leader || item.readCount / item.bookCount > leader.readCount / leader.bookCount) {
      leader = item;
    }
  }

  if (!leader) return null;

  const readPercent = Math.round((leader.readCount / leader.bookCount) * 100);
  return readPercent > 0 ? { name: leader.name, readPercent } : null;
}

function itemsForKind(book: BookSummary, kind: TopItemsKind): readonly string[] {
  const metadata = book.metadata;
  if (!metadata) return [];

  switch (kind) {
    case 'authors':
      return metadata.authors ?? [];
    case 'categories':
      return metadata.categories ?? [];
    case 'series':
      return metadata.seriesName ? [metadata.seriesName] : [];
    case 'publishers':
      return metadata.publisher ? [metadata.publisher] : [];
    case 'tags':
      return metadata.tags ?? [];
    case 'moods':
      return metadata.moods ?? [];
  }
}
