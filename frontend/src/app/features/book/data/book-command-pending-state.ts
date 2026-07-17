import {computed, Signal} from '@angular/core';
import {injectMutationState} from '@tanstack/angular-query-experimental';

import {bookCommandKeys} from './book-command-keys';
import {
  DeleteBooksVariables,
  SetAllBookMetadataLocksVariables,
  SetBookReadStatusVariables,
} from './book-command.models';
import {BookReadStatus, BookShelf, BookSummary} from './book-response.models';
import {bookShelfCommandKeys} from './book-shelf-command-keys';
import {UpdateBookShelfMembershipVariables} from './book-shelf-command.models';

export interface PendingShelfMembership {
  readonly assignShelfIds: ReadonlySet<number>;
  readonly unassignShelfIds: ReadonlySet<number>;
}

export interface PendingBookOverlay {
  readonly readStatuses: ReadonlyMap<number, BookReadStatus>;
  readonly shelfMembership: ReadonlyMap<number, PendingShelfMembership>;
  readonly metadataLocks: ReadonlyMap<number, boolean>;
  readonly shelvesById: ReadonlyMap<number, BookShelf>;
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

export function injectPendingBookShelfMembership(): Signal<ReadonlyMap<number, PendingShelfMembership>> {
  const pendingVariables = injectMutationState<UpdateBookShelfMembershipVariables>(() => ({
    filters: {
      mutationKey: bookShelfCommandKeys.updateMembership(),
      status: 'pending',
    },
    select: mutation => mutation.state.variables as UpdateBookShelfMembershipVariables,
  }));

  return computed(() => {
    const memberships = new Map<number, PendingShelfMembership>();
    for (const variables of pendingVariables()) {
      for (const bookId of variables.bookIds) {
        const current = memberships.get(bookId);
        const assignShelfIds = new Set(current?.assignShelfIds);
        const unassignShelfIds = new Set(current?.unassignShelfIds);

        for (const shelfId of variables.assignShelfIds) {
          unassignShelfIds.delete(shelfId);
          assignShelfIds.add(shelfId);
        }
        for (const shelfId of variables.unassignShelfIds) {
          assignShelfIds.delete(shelfId);
          unassignShelfIds.add(shelfId);
        }

        memberships.set(bookId, {assignShelfIds, unassignShelfIds});
      }
    }
    return memberships;
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
  const shelfMembership = overlay.shelfMembership.get(book.id);
  const hasMetadataLock = overlay.metadataLocks.has(book.id);
  if (!hasReadStatus && !shelfMembership && !hasMetadataLock) {
    return book;
  }

  const retainedShelves = shelfMembership
    ? (book.shelves ?? [])
      .filter(shelf => shelf.id == null || !shelfMembership.unassignShelfIds.has(shelf.id))
    : book.shelves ?? [];
  const shelves = shelfMembership
    ? retainedShelves.concat([...shelfMembership.assignShelfIds]
        .filter(shelfId => !retainedShelves.some(shelf => shelf.id === shelfId))
        .flatMap(shelfId => {
          const shelf = overlay.shelvesById.get(shelfId);
          return shelf ? [shelf] : [];
        }))
    : book.shelves;

  return {
    ...book,
    ...(hasReadStatus ? {readStatus: overlay.readStatuses.get(book.id)} : {}),
    ...(shelfMembership ? {shelves} : {}),
    ...(hasMetadataLock && book.metadata ? {
      metadata: {
        ...book.metadata,
        allMetadataLocked: overlay.metadataLocks.get(book.id) ?? book.metadata.allMetadataLocked,
      },
    } : {}),
  };
}
