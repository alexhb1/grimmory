import {QueryClient} from '@tanstack/angular-query-experimental';

import {bookQueryKeys} from './book-query-keys';

function uniqueBookIds(bookIds: Iterable<number>): Set<number> {
  return new Set(bookIds);
}

export interface BookQueryChangeSet {
  readonly changedBookIds?: Iterable<number>;
  readonly deletedBookIds?: Iterable<number>;
}

export function invalidateAllBookQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({queryKey: bookQueryKeys.all()});
}

export function invalidateBookCollections(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({queryKey: bookQueryKeys.collections()});
}

export function invalidateBookRecommendations(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({queryKey: bookQueryKeys.recommendations()});
}

export async function applyBookQueryChangeSet(
  queryClient: QueryClient,
  update: BookQueryChangeSet,
): Promise<void> {
  const deletedBookIds = uniqueBookIds(update.deletedBookIds ?? []);
  const changedBookIds = uniqueBookIds(update.changedBookIds ?? []);
  for (const bookId of deletedBookIds) {
    changedBookIds.delete(bookId);
  }

  if (changedBookIds.size === 0 && deletedBookIds.size === 0) {
    return;
  }

  for (const bookId of deletedBookIds) {
    queryClient.removeQueries({queryKey: bookQueryKeys.detailQueries(bookId)});
    queryClient.removeQueries({queryKey: bookQueryKeys.recommendationQueries(bookId)});
  }

  await Promise.all([
    invalidateBookCollections(queryClient),
    ...Array.from(changedBookIds, bookId =>
      queryClient.invalidateQueries({queryKey: bookQueryKeys.detailQueries(bookId)})),
    queryClient.invalidateQueries({queryKey: bookQueryKeys.batches()}),
    queryClient.invalidateQueries({queryKey: bookQueryKeys.recommendations()}),
  ]);
}
