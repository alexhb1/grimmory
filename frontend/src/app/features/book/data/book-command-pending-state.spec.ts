import {HttpErrorResponse} from '@angular/common/http';
import {HttpTestingController} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {injectMutation, QueryClient} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {
  injectPendingBookDeletions,
  injectPendingBookMetadataLocks,
  injectPendingBookReadStatuses,
  injectPendingBookShelfMembership,
  overlayPendingBookState,
} from './book-command-pending-state';
import {type BookSummary} from './book-response.models';
import {BookCommandService} from './book-command.service';
import {BookShelfCommandService} from './book-shelf-command.service';

@Injectable()
class BookCommandPendingHost {
  private readonly bookCommands = inject(BookCommandService);
  private readonly shelfCommands = inject(BookShelfCommandService);

  readonly readStatuses = injectPendingBookReadStatuses();
  readonly shelfMembership = injectPendingBookShelfMembership();
  readonly metadataLocks = injectPendingBookMetadataLocks();
  readonly deletions = injectPendingBookDeletions();
  readonly setReadStatus = injectMutation(() => this.bookCommands.setReadStatus());
  readonly updateShelfMembership = injectMutation(() => this.shelfCommands.updateMembership());
  readonly setAllMetadataLocks = injectMutation(() => this.bookCommands.setAllMetadataLocks());
  readonly deleteBooks = injectMutation(() => this.bookCommands.deleteBooks());
}

async function flushMutationStart(): Promise<void> {
  await Promise.resolve();
  flushSignalAndQueryEffects();
}

function membershipBook(id: number): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    shelves: [],
  };
}

describe('pending book command projections', () => {
  let host: BookCommandPendingHost;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    TestBed.configureTestingModule({
      providers: [
        ...harness.providers,
        BookCommandService,
        BookShelfCommandService,
        BookCommandPendingHost,
      ],
    });
    host = TestBed.inject(BookCommandPendingHost);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('starts with empty pending projections', () => {
    expect(host.readStatuses()).toEqual(new Map());
    expect(host.shelfMembership()).toEqual(new Map());
    expect(host.metadataLocks()).toEqual(new Map());
    expect(host.deletions()).toEqual(new Set());
  });

  it('projects one pending read-status intent across every requested book', async () => {
    const result = host.setReadStatus.mutateAsync({
      bookIds: [2, 5],
      status: 'READING',
    });
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`);
    expect(host.readStatuses()).toEqual(new Map([
      [2, 'READING'],
      [5, 'READING'],
    ]));

    request.flush([
      {bookId: 2, readStatus: 'READING'},
      {bookId: 5, readStatus: 'READING'},
    ]);
    await result;
  });

  it('lets the newest pending read-status intent win for the same book', async () => {
    const firstResult = host.setReadStatus.mutateAsync({bookIds: [3], status: 'READING'});
    const secondResult = host.setReadStatus.mutateAsync({bookIds: [3, 4], status: 'PAUSED'});
    await flushMutationStart();

    expect(host.readStatuses()).toEqual(new Map([
      [3, 'PAUSED'],
      [4, 'PAUSED'],
    ]));

    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`).flush([
      {bookId: 3, readStatus: 'READING'},
    ]);
    await firstResult;
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`).flush([
      {bookId: 3, readStatus: 'PAUSED'},
      {bookId: 4, readStatus: 'PAUSED'},
    ]);
    await secondResult;
  });

  it('removes read-status intent after success', async () => {
    const result = host.setReadStatus.mutateAsync({bookIds: [6], status: 'READ'});
    await flushMutationStart();
    expect(host.readStatuses().get(6)).toBe('READ');

    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`).flush([
      {bookId: 6, readStatus: 'READ'},
    ]);
    await result;

    await vi.waitFor(() => {
      expect(host.readStatuses()).toEqual(new Map());
    });
  });

  it('removes read-status intent after error', async () => {
    const result = host.setReadStatus.mutateAsync({bookIds: [7], status: 'WONT_READ'});
    void result.catch(() => undefined);
    await flushMutationStart();
    expect(host.readStatuses().get(7)).toBe('WONT_READ');

    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`).flush(
      'Unavailable',
      {status: 503, statusText: 'Service Unavailable'},
    );

    await expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
    await vi.waitFor(() => {
      expect(host.readStatuses()).toEqual(new Map());
    });
  });

  it('accumulates shelf intent per book with the newest conflict winning', async () => {
    const firstResult = host.updateShelfMembership.mutateAsync({
      bookIds: [1, 2],
      assignShelfIds: [10],
      unassignShelfIds: [20],
    });
    const secondResult = host.updateShelfMembership.mutateAsync({
      bookIds: [1],
      assignShelfIds: [20, 30],
      unassignShelfIds: [10, 40],
    });
    await flushMutationStart();

    expect(host.shelfMembership()).toEqual(new Map([
      [1, {
        assignShelfIds: new Set([20, 30]),
        unassignShelfIds: new Set([10, 40]),
      }],
      [2, {
        assignShelfIds: new Set([10]),
        unassignShelfIds: new Set([20]),
      }],
    ]));

    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`).flush([
      membershipBook(1),
      membershipBook(2),
    ]);
    await firstResult;
    await flushMutationStart();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`).flush([membershipBook(1)]);
    await secondResult;
  });

  it('removes shelf intent after success and error', async () => {
    const successResult = host.updateShelfMembership.mutateAsync({
      bookIds: [8],
      assignShelfIds: [12],
      unassignShelfIds: [],
    });
    await flushMutationStart();
    expect(host.shelfMembership().get(8)?.assignShelfIds).toEqual(new Set([12]));

    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`).flush([membershipBook(8)]);
    await successResult;
    await vi.waitFor(() => {
      expect(host.shelfMembership()).toEqual(new Map());
    });

    const errorResult = host.updateShelfMembership.mutateAsync({
      bookIds: [9],
      assignShelfIds: [],
      unassignShelfIds: [12],
    });
    void errorResult.catch(() => undefined);
    await flushMutationStart();
    await vi.waitFor(() => {
      expect(host.shelfMembership().get(9)?.unassignShelfIds).toEqual(new Set([12]));
    });

    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`).flush(
      'Unavailable',
      {status: 503, statusText: 'Service Unavailable'},
    );
    await expect(errorResult).rejects.toBeInstanceOf(HttpErrorResponse);
    await vi.waitFor(() => {
      expect(host.shelfMembership()).toEqual(new Map());
    });
  });

  it('projects metadata lock intent while the command is pending', async () => {
    const result = host.setAllMetadataLocks.mutateAsync({bookIds: [10, 14], locked: true});
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/metadata/toggle-all-lock`);
    expect(host.metadataLocks()).toEqual(new Map([
      [10, true],
      [14, true],
    ]));

    request.flush([
      {bookId: 10, allMetadataLocked: true},
      {bookId: 14, allMetadataLocked: true},
    ]);
    await result;
    await vi.waitFor(() => {
      expect(host.metadataLocks()).toEqual(new Map());
    });
  });

  it('projects deleted book ids while the command is pending', async () => {
    const result = host.deleteBooks.mutateAsync({bookIds: [11, 12]});
    await flushMutationStart();

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books?ids=11,12`);
    expect(host.deletions()).toEqual(new Set([11, 12]));

    request.flush({deleted: [11, 12], failedFileDeletions: []});
    await result;
    await vi.waitFor(() => {
      expect(host.deletions()).toEqual(new Set());
    });
  });
});

describe('overlayPendingBookState', () => {
  const book: BookSummary = {
    id: 1,
    libraryId: 2,
    libraryName: 'Library',
    readStatus: 'UNREAD',
    metadata: {
      bookId: 1,
      title: 'Book',
      allMetadataLocked: false,
    },
    shelves: [
      {id: 20, name: 'Remove', publicShelf: false, bookCount: 1},
      {id: 30, name: 'Keep', publicShelf: false, bookCount: 1},
    ],
  };
  const emptyOverlay = {
    readStatuses: new Map(),
    shelfMembership: new Map(),
    metadataLocks: new Map(),
    shelvesById: new Map(),
  };

  it('preserves identity when no pending state touches the book', () => {
    expect(overlayPendingBookState(book, emptyOverlay)).toBe(book);
  });

  it('replaces the read status verbatim', () => {
    const result = overlayPendingBookState(book, {
      ...emptyOverlay,
      readStatuses: new Map([[1, 'UNSET']]),
    });

    expect(result.readStatus).toBe('UNSET');
  });

  it('replaces an existing metadata lock without fabricating metadata', () => {
    const locked = overlayPendingBookState(book, {
      ...emptyOverlay,
      metadataLocks: new Map([[1, true]]),
    });
    const withoutMetadata = {...book, metadata: undefined};
    const untouchedMetadata = overlayPendingBookState(withoutMetadata, {
      ...emptyOverlay,
      metadataLocks: new Map([[1, true]]),
    });

    expect(locked.metadata).toEqual({...book.metadata, allMetadataLocked: true});
    expect(locked.metadata).not.toBe(book.metadata);
    expect(untouchedMetadata.metadata).toBeUndefined();
  });

  it('merges shelf assignments and removals using resolved shelf names', () => {
    const result = overlayPendingBookState(book, {
      ...emptyOverlay,
      shelfMembership: new Map([[1, {
        assignShelfIds: new Set([20, 30, 40]),
        unassignShelfIds: new Set([20]),
      }]]),
      shelvesById: new Map([
        [20, {id: 20, name: 'Reassigned', publicShelf: false, bookCount: 0}],
        [40, {id: 40, name: 'Assigned', publicShelf: true, bookCount: 2}],
      ]),
    });

    expect(result.shelves).toEqual([
      {id: 30, name: 'Keep', publicShelf: false, bookCount: 1},
      {id: 20, name: 'Reassigned', publicShelf: false, bookCount: 0},
      {id: 40, name: 'Assigned', publicShelf: true, bookCount: 2},
    ]);
  });
});
