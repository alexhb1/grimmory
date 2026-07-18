export interface NormalizeBookIdsOptions {
  readonly sort?: boolean;
}

export function normalizeBookId(bookId: unknown): number {
  if (typeof bookId !== 'number' || !Number.isSafeInteger(bookId) || bookId <= 0) {
    throw new Error('Book ID must be a positive integer.');
  }
  return bookId;
}

export function normalizeBookIds(
  bookIds: unknown,
  options: NormalizeBookIdsOptions = {},
): readonly number[] {
  if (!Array.isArray(bookIds)) {
    throw new Error('Book IDs must be an array.');
  }
  const normalized = [...new Set(bookIds.map(normalizeBookId))];
  if (normalized.length === 0) {
    throw new Error('At least one book ID is required.');
  }
  return options.sort ? normalized.sort((first, second) => first - second) : normalized;
}
