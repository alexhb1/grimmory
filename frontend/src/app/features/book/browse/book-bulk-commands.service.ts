import {inject, Injectable, signal} from '@angular/core';
import {TranslocoService} from '@jsverse/transloco';
import {ConfirmationService, MessageService} from '@openng/optimus-ui/api';
import {injectMutation} from '@tanstack/angular-query-experimental';
import {take} from 'rxjs/operators';

import {
  BOOK_READ_STATUS_LABEL_KEYS,
  CLEAR_BOOK_READ_STATUS_LABEL_KEY,
} from '../components/book-read-status-options';
import {DeleteBooksPartialError, type BookProgressSource} from '../data/book-command.models';
import {BookBackgroundSubmissionService} from '../data/book-background-submission.service';
import {BookCommandService} from '../data/book-command.service';
import {BookShelfCommandService} from '../data/book-shelf-command.service';
import {type BookSummary, type KnownBookReadStatus} from '../data/book-response.models';
import {MetadataRefreshSubmissionService} from '../../metadata/data/metadata-refresh-submission.service';
import {type BookFileAttacherSourceBook} from '../components/book-file-attacher/book-file-attacher.component';
import {BookDialogHelperService} from '../service/book-dialog-helper.service';
import {legacyBookCachePatches, withLegacyBookCache} from '../service/book-command-legacy-adapter';
import {resolveSelectedBookIds, type BookBrowseSelection} from './book-browse-selection';

type ResolveSelectedIds = () => Promise<readonly number[]>;

@Injectable()
export class BookBulkCommandsService {
  private readonly transloco = inject(TranslocoService);
  private readonly dialogHelper = inject(BookDialogHelperService);
  private readonly metadataRefresh = inject(MetadataRefreshSubmissionService);
  private readonly backgroundSubmission = inject(BookBackgroundSubmissionService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly bookCommands = inject(BookCommandService);
  private readonly shelfCommands = inject(BookShelfCommandService);

  private readonly shelfMembershipMutation = injectMutation(() => withLegacyBookCache(
    this.shelfCommands.updateMembership(), legacyBookCachePatches.shelfMembership));
  private readonly readStatusMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.setReadStatus(), legacyBookCachePatches.readStatus));
  private readonly refreshMetadataMutation = injectMutation(() =>
    this.metadataRefresh.refreshMetadata()
  );
  private readonly deleteBooksMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.deleteBooks(), legacyBookCachePatches.deleteBooks));
  private readonly resetProgressMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.resetProgress(), legacyBookCachePatches.resetProgress));
  private readonly metadataLocksMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.setAllMetadataLocks(), legacyBookCachePatches.metadataAllLocks));
  private readonly changeCoversMutation = injectMutation(() => this.backgroundSubmission.changeCovers());

  readonly isResolving = signal(false);

  toggleShelf(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds, shelfId: number, checked: boolean): void {
    void this.withSelectedBookIds(selection, resolveIds, bookIds =>
      this.shelfMembershipMutation.mutate({
        bookIds: [...bookIds],
        assignShelfIds: checked ? [shelfId] : [],
        unassignShelfIds: checked ? [] : [shelfId],
      }));
  }

  removeFromAllShelves(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds, shelfIds: readonly number[]): void {
    if (shelfIds.length === 0) {
      return;
    }
    void this.withSelectedBookIds(selection, resolveIds, bookIds =>
      this.shelfMembershipMutation.mutate({
        bookIds: [...bookIds],
        assignShelfIds: [],
        unassignShelfIds: [...shelfIds],
      }));
  }

  editAll(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds): void {
    void this.withSelectedBookIds(selection, resolveIds, bookIds => void this.dialogHelper
      .openBulkMetadataEditDialog(new Set(bookIds))
      .then(ref => ref?.onClose.pipe(take(1)).subscribe(() => selection.clear())));
  }

  editOneByOne(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds): void {
    void this.withSelectedBookIds(selection, resolveIds, bookIds => void this.dialogHelper
      .openMultibookMetadataEditorDialog(new Set(bookIds))
      .then(ref => ref?.onClose.pipe(take(1)).subscribe(() => selection.clear())));
  }

  lockUnlockMetadata(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds): void {
    void this.withSelectedBookIds(selection, resolveIds, bookIds => void this.dialogHelper
      .openLockUnlockMetadataDialog(new Set(bookIds))
      .then(ref => ref?.onClose.pipe(take(1)).subscribe(() => selection.clear())));
  }

  organizeFiles(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds): void {
    void this.withSelectedBookIds(selection, resolveIds, bookIds => void this.dialogHelper
      .openFileMoverDialog(new Set(bookIds)));
  }

  createShelf(): void {
    void this.dialogHelper.openShelfCreatorDialog();
  }

  attachFiles(selection: BookBrowseSelection, books: readonly BookSummary[]): void {
    const sourceBooks: BookFileAttacherSourceBook[] = books.filter(book => selection.isSelected(book.id));
    void this.dialogHelper.openBulkBookFileAttacherDialog(sourceBooks)
      .then(ref => ref?.onClose.pipe(take(1)).subscribe((result: {success?: boolean} | undefined) => {
        if (result?.success) {
          selection.clear();
        }
      }));
  }

  resetProgress(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds, source: BookProgressSource): void {
    void this.withSelectedBookIds(selection, resolveIds, bookIds =>
      this.resetProgressMutation.mutate({bookIds: [...bookIds], source}));
  }

  setMetadataLocks(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds, locked: boolean): void {
    void this.withSelectedBookIds(selection, resolveIds, bookIds =>
      this.metadataLocksMutation.mutate({bookIds: [...bookIds], locked}));
  }

  changeCovers(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds, kind: 'regenerate' | 'generate'): void {
    const regenerate = kind === 'regenerate';
    this.confirmationService.confirm({
      message: this.transloco.translate(
        regenerate ? 'book.browser.confirm.regenCoverMessage' : 'book.browser.confirm.customCoverMessage',
        {count: selection.count().toLocaleString()},
      ),
      header: this.transloco.translate(
        regenerate ? 'book.browser.confirm.regenCoverHeader' : 'book.browser.confirm.customCoverHeader',
      ),
      acceptLabel: this.transloco.translate('common.confirm'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => {
        void this.withSelectedBookIds(selection, resolveIds, bookIds =>
          this.changeCoversMutation.mutate({kind, bookIds: [...bookIds]}));
      },
    });
  }

  fetchMetadata(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds): void {
    void this.withSelectedBookIds(selection, resolveIds, bookIds =>
      this.refreshMetadataMutation.mutate({bookIds: [...bookIds]}));
  }

  fetchMetadataWithOptions(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds): void {
    void this.withSelectedBookIds(selection, resolveIds, bookIds =>
      void this.dialogHelper.openMetadataRefreshDialog(new Set(bookIds)));
  }

  delete(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('book.browser.confirm.deleteMessage', {
        count: selection.count().toLocaleString(),
      }),
      header: this.transloco.translate('book.browser.confirm.deleteHeader'),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-outlined',
      accept: () => {
        void this.withSelectedBookIds(selection, resolveIds, bookIds =>
          this.deleteBooksMutation.mutate({bookIds: [...bookIds]}, {
            onSuccess: result => selection.pruneDeleted(result.removedBookIds),
            onError: error => {
              if (error instanceof DeleteBooksPartialError) {
                selection.pruneDeleted(error.completed.removedBookIds);
              }
            },
          }));
      },
    });
  }

  markAs(selection: BookBrowseSelection, resolveIds: ResolveSelectedIds, status: KnownBookReadStatus): void {
    const statusLabel = this.transloco.translate(
      status === 'UNSET'
        ? CLEAR_BOOK_READ_STATUS_LABEL_KEY
        : BOOK_READ_STATUS_LABEL_KEYS[status],
    );
    this.confirmationService.confirm({
      header: this.transloco.translate('browse.bulk.updateReadStatus'),
      message: this.transloco.translate('browse.bulk.markAsMessage', {
        count: selection.count().toLocaleString(),
        status: statusLabel,
      }),
      acceptLabel: this.transloco.translate('common.confirm'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => {
        void this.withSelectedBookIds(selection, resolveIds, bookIds =>
          this.readStatusMutation.mutate({bookIds: [...bookIds], status}));
      },
    });
  }

  private async withSelectedBookIds(
    selection: BookBrowseSelection,
    resolveIds: ResolveSelectedIds,
    run: (bookIds: readonly number[]) => void,
  ): Promise<void> {
    if (this.isResolving()) {
      return;
    }
    this.isResolving.set(true);
    let bookIds: readonly number[];
    try {
      bookIds = await resolveSelectedBookIds(selection.state(), resolveIds);
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: this.transloco.translate('browse.bulk.selectionLoadError'),
      });
      return;
    } finally {
      this.isResolving.set(false);
    }
    if (bookIds.length === 0) {
      selection.clear();
      this.messageService.add({
        severity: 'info',
        summary: this.transloco.translate('browse.bulk.selectionEmpty'),
      });
      return;
    }
    run(bookIds);
  }
}
