import {inject, Injectable} from '@angular/core';
import {QueryClient} from '@tanstack/angular-query-experimental';

import {
  invalidateAllBookQueries,
  invalidateBookRecommendations,
  applyBookQueryChangeSet,
} from '../data/book-query-cache';
import {reconcileLegacyBookSocketEvent} from './legacy-book-cache';

interface BookCoverPatch {
  readonly id: number;
  readonly coverUpdatedOn: string;
}

interface BookEventRecord extends Readonly<Record<string, unknown>> {
  readonly id: number;
}

@Injectable({providedIn: 'root'})
export class BookSocketService {
  private readonly queryClient = inject(QueryClient);

  handleNewlyCreatedBook(payload: unknown): void {
    const book = decodeBookEventRecord(payload);
    if (book === null) {
      return;
    }

    if (isFullLegacyBookRecord(book)) {
      reconcileLegacyBookSocketEvent(this.queryClient, {kind: 'created', bookPayload: book});
      void applyBookQueryChangeSet(this.queryClient, {changedBookIds: [book.id]});
      return;
    }
    this.reconcileKnownChanges([book.id]);
  }

  handleRemovedBookIds(payload: unknown): void {
    const bookIds = decodeBookIds(payload);
    if (bookIds === null) {
      return;
    }

    reconcileLegacyBookSocketEvent(this.queryClient, {kind: 'deleted', bookIds});
    void applyBookQueryChangeSet(this.queryClient, {deletedBookIds: bookIds});
  }

  handleBookUpdate(payload: unknown): void {
    const book = decodeBookEventRecord(payload);
    if (book !== null) {
      if (isFullLegacyBookRecord(book)) {
        reconcileLegacyBookSocketEvent(this.queryClient, {kind: 'updated', bookPayloads: [book]});
        void applyBookQueryChangeSet(this.queryClient, {changedBookIds: [book.id]});
      } else {
        this.reconcileKnownChanges([book.id]);
      }
      return;
    }

    const bookIds = decodeBookIds(payload);
    if (bookIds === null) {
      return;
    }
    this.reconcileKnownChanges(bookIds);
  }

  handleMultipleBookUpdates(payload: unknown): void {
    const books = decodeBookEventRecords(payload);
    if (books === null) {
      return;
    }

    if (!books.every(isFullLegacyBookRecord)) {
      this.reconcileKnownChanges(books.map(book => book.id));
      return;
    }
    reconcileLegacyBookSocketEvent(this.queryClient, {kind: 'updated', bookPayloads: books});
    void applyBookQueryChangeSet(this.queryClient, {
      changedBookIds: books.map(book => book.id),
    });
  }

  handleBookMetadataUpdate(payload: unknown): void {
    if (!isPositiveSafeInteger(payload)) {
      return;
    }
    this.reconcileKnownChanges([payload]);
  }

  handleMultipleBookCoverPatches(payload: unknown): void {
    const patches = decodeBookCoverPatches(payload);
    if (patches === null) {
      return;
    }

    reconcileLegacyBookSocketEvent(this.queryClient, {kind: 'covers', patches});
    void applyBookQueryChangeSet(this.queryClient, {changedBookIds: patches.map(patch => patch.id)});
  }

  handleTaskProgress(payload: unknown): void {
    if (!isRecord(payload)
      || typeof payload['taskId'] !== 'string'
      || payload['taskId'].trim().length === 0
      || payload['taskType'] !== 'UPDATE_BOOK_RECOMMENDATIONS'
      || payload['taskStatus'] !== 'COMPLETED'
      || payload['progress'] !== 100
      || typeof payload['message'] !== 'string') {
      return;
    }
    void invalidateBookRecommendations(this.queryClient);
  }

  handleReconnect(): void {
    reconcileLegacyBookSocketEvent(this.queryClient, {kind: 'reconnect'});
    void invalidateAllBookQueries(this.queryClient);
  }

  private reconcileKnownChanges(bookIds: readonly number[]): void {
    reconcileLegacyBookSocketEvent(this.queryClient, {kind: 'changed', bookIds});
    void applyBookQueryChangeSet(this.queryClient, {changedBookIds: bookIds});
  }
}

function decodeBookEventRecord(payload: unknown): BookEventRecord | null {
  if (!isRecord(payload) || !isPositiveSafeInteger(payload['id'])) {
    return null;
  }
  return payload as BookEventRecord;
}

function decodeBookEventRecords(payload: unknown): readonly BookEventRecord[] | null {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const books = payload.map(decodeBookEventRecord);
  if (books.some(book => book === null)) {
    return null;
  }
  return books as BookEventRecord[];
}

function isFullLegacyBookRecord(book: BookEventRecord): boolean {
  if (!isPositiveSafeInteger(book['libraryId'])
    || typeof book['libraryName'] !== 'string'
    || book['libraryName'].trim().length === 0) {
    return false;
  }
  if (!Object.hasOwn(book, 'metadata') || book['metadata'] === undefined || book['metadata'] === null) {
    return true;
  }
  const metadata = book['metadata'];
  return isRecord(metadata) && metadata['bookId'] === book.id;
}

function decodeBookIds(payload: unknown): readonly number[] | null {
  if (!Array.isArray(payload) || payload.length === 0 || !payload.every(isPositiveSafeInteger)) {
    return null;
  }
  return [...new Set(payload)];
}

function decodeBookCoverPatches(payload: unknown): readonly BookCoverPatch[] | null {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const patches = payload.map(item => {
    if (!isRecord(item)
      || !isPositiveSafeInteger(item['id'])
      || typeof item['coverUpdatedOn'] !== 'string') {
      return null;
    }
    return {id: item['id'], coverUpdatedOn: item['coverUpdatedOn']};
  });
  if (patches.some(patch => patch === null)) {
    return null;
  }

  return [...new Map(
    (patches as BookCoverPatch[]).map(patch => [patch.id, patch]),
  ).values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
