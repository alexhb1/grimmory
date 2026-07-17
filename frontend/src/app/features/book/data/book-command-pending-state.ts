import {computed, Signal} from '@angular/core';
import {injectMutationState} from '@tanstack/angular-query-experimental';

import {bookCommandKeys} from './book-command-keys';
import {
  DeleteBooksVariables,
  SetAllBookMetadataLocksVariables,
  SetBookReadStatusVariables,
} from './book-command.models';
import {BookReadStatus, BookSummary} from './book-response.models';

export interface PendingBookOverlay {
  readonly readStatuses: ReadonlyMap<number, BookReadStatus>;
  readonly metadataLocks: ReadonlyMap<number, boolean>;
}

export function injectPendingBookReadStatuses(): Signal<ReadonlyMap<number, BookReadStatus>> {
  const pendingVariables = injectMutationState<SetBookReadStatusVariables>(() => ({
    filters: {
      mutationKey: bookCommandKeys.readStatus(),
      status: 'pending',
    },
    select: mutation => mutation.state.variables as SetBookReadStatusVariables,
  }));

  return computed(() => {
    const statuses = new Map<number, BookReadStatus>();
    for (const variables of pendingVariables()) {
      for (const bookId of variables.bookIds) {
        statuses.set(bookId, variables.status);
      }
    }
    return statuses;
  });
}

export function injectPendingBookMetadataLocks(): Signal<ReadonlyMap<number, boolean>> {
  const pendingVariables = injectMutationState<SetAllBookMetadataLocksVariables>(() => ({
    filters: {
      mutationKey: bookCommandKeys.metadataAllLocks(),
      status: 'pending',
    },
    select: mutation => mutation.state.variables as SetAllBookMetadataLocksVariables,
  }));

  return computed(() => {
    const locks = new Map<number, boolean>();
    for (const variables of pendingVariables()) {
      for (const bookId of variables.bookIds) {
        locks.set(bookId, variables.locked);
      }
    }
    return locks;
  });
}

export function injectPendingBookDeletions(): Signal<ReadonlySet<number>> {
  const pendingVariables = injectMutationState<DeleteBooksVariables>(() => ({
    filters: {
      mutationKey: bookCommandKeys.deleteBooks(),
      status: 'pending',
    },
    select: mutation => mutation.state.variables as DeleteBooksVariables,
  }));

  return computed(() => {
    const deletions = new Set<number>();
    for (const variables of pendingVariables()) {
      for (const bookId of variables.bookIds) {
        deletions.add(bookId);
      }
    }
    return deletions;
  });
}

export function overlayPendingBookState(
  book: BookSummary,
  overlay: PendingBookOverlay,
): BookSummary {
  const hasReadStatus = overlay.readStatuses.has(book.id);
  const hasMetadataLock = overlay.metadataLocks.has(book.id);
  if (!hasReadStatus && !hasMetadataLock) {
    return book;
  }

  return {
    ...book,
    ...(hasReadStatus ? {readStatus: overlay.readStatuses.get(book.id)} : {}),
    ...(hasMetadataLock && book.metadata ? {
      metadata: {
        ...book.metadata,
        allMetadataLocked: overlay.metadataLocks.get(book.id) ?? book.metadata.allMetadataLocked,
      },
    } : {}),
  };
}
