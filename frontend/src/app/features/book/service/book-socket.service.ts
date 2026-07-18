import {DestroyRef, inject, Injectable} from '@angular/core';
import {QueryClient} from '@tanstack/angular-query-experimental';

import {invalidateBookRecommendations} from '../data/book-query-cache';
import {isPositiveSafeInteger, isRecord} from '../data/json-guards';
import {Book} from '../model/book.model';
import {
  awaitBookCacheReconciliations,
  invalidateBooksQuery,
  invalidateLegacyBookRecommendations,
  patchBooksInCache,
  patchBookCoversInCache,
  reconcileBookCacheChangeSet,
  upsertBooksInCache,
} from './legacy-book-cache';

interface BookCoverPatch {
  readonly id: number;
  readonly coverUpdatedOn: string;
}
@Injectable({providedIn: 'root'})
export class BookSocketService {
  private readonly queryClient = inject(QueryClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reconciliationDelayMs = 50;
  private readonly pendingChangedBookIds = new Set<number>();
  private readonly pendingDeletedBookIds = new Set<number>();
  private reconciliationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearPendingReconciliation());
  }

  handleNewlyCreatedBook(payload: unknown): void {
    const book = decodeLegacyBookPayload(payload);
    if (book === null) {
      console.warn('[BookSocket] Ignored malformed book-add payload');
      return;
    }
    upsertBooksInCache(this.queryClient, [book]);
  }

  handleRemovedBookIds(payload: unknown): void {
    if (Array.isArray(payload) && payload.length === 0) {
      return;
    }
    const bookIds = decodeBookIds(payload);
    if (bookIds === null) {
      console.warn('[BookSocket] Ignored malformed books-remove payload');
      return;
    }

    this.queueDeletedBooks(bookIds);
  }

  handleBookUpdate(payload: unknown): void {
    const book = decodeLegacyBookPayload(payload);
    if (book !== null) {
      patchBooksInCache(this.queryClient, [book]);
      return;
    }

    if (Array.isArray(payload) && payload.length === 0) {
      return;
    }
    const bookIds = decodeBookIds(payload);
    if (bookIds === null) {
      console.warn('[BookSocket] Ignored malformed book-update payload');
      return;
    }
    this.queueKnownChanges(bookIds);
  }

  handleBookMetadataUpdate(payload: unknown): void {
    if (!isPositiveSafeInteger(payload)) {
      console.warn('[BookSocket] Ignored malformed book-metadata-update payload');
      return;
    }
    this.queueKnownChanges([payload]);
  }

  handleMultipleBookCoverPatches(payload: unknown): void {
    if (Array.isArray(payload) && payload.length === 0) {
      return;
    }
    const patches = decodeBookCoverPatches(payload);
    if (patches === null) {
      console.warn('[BookSocket] Ignored malformed books-cover-update payload');
      return;
    }

    patchBookCoversInCache(this.queryClient, patches);
  }

  handleTaskProgress(payload: unknown): void {
    if (!isRecord(payload)
      || payload['taskType'] !== 'UPDATE_BOOK_RECOMMENDATIONS'
      || payload['taskStatus'] !== 'COMPLETED') {
      return;
    }
    void awaitBookCacheReconciliations([
      () => invalidateBookRecommendations(this.queryClient),
      () => invalidateLegacyBookRecommendations(this.queryClient),
    ]);
  }

  handleReconnect(): void {
    this.clearPendingReconciliation();
    invalidateBooksQuery(this.queryClient);
  }

  private queueKnownChanges(bookIds: readonly number[]): void {
    for (const bookId of bookIds) {
      if (!this.pendingDeletedBookIds.has(bookId)) {
        this.pendingChangedBookIds.add(bookId);
      }
    }
    this.scheduleReconciliation();
  }

  private queueDeletedBooks(bookIds: readonly number[]): void {
    for (const bookId of bookIds) {
      this.pendingChangedBookIds.delete(bookId);
      this.pendingDeletedBookIds.add(bookId);
    }
    this.scheduleReconciliation();
  }

  private scheduleReconciliation(): void {
    if (this.reconciliationTimer !== null) {
      return;
    }

    this.reconciliationTimer = setTimeout(() => this.flushPendingReconciliation(), this.reconciliationDelayMs);
  }

  private flushPendingReconciliation(): void {
    this.reconciliationTimer = null;
    const changedBookIds = [...this.pendingChangedBookIds];
    const deletedBookIds = [...this.pendingDeletedBookIds];
    this.pendingChangedBookIds.clear();
    this.pendingDeletedBookIds.clear();

    void reconcileBookCacheChangeSet(
      this.queryClient,
      {changedBookIds, deletedBookIds},
      {legacyList: 'needs-refetch'},
    );
  }

  private clearPendingReconciliation(): void {
    if (this.reconciliationTimer !== null) {
      clearTimeout(this.reconciliationTimer);
      this.reconciliationTimer = null;
    }
    this.pendingChangedBookIds.clear();
    this.pendingDeletedBookIds.clear();
  }
}

function decodeLegacyBookPayload(payload: unknown): Book | null {
  if (!isRecord(payload) || !isPositiveSafeInteger(payload['id'])) {
    return null;
  }
  return payload as Book;
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

  const patchesById = new Map<number, BookCoverPatch>();
  for (const item of payload) {
    if (!isRecord(item)
      || !isPositiveSafeInteger(item['id'])
      || typeof item['coverUpdatedOn'] !== 'string') {
      return null;
    }
    patchesById.set(item['id'], {id: item['id'], coverUpdatedOn: item['coverUpdatedOn']});
  }

  return [...patchesById.values()];
}
