import {ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild} from '@angular/core';
import {Router} from '@angular/router';
import {TranslocoService} from '@jsverse/transloco';
import {ConfirmationService} from '@openng/optimus-ui/api';
import {injectMutation, injectQuery} from '@tanstack/angular-query-experimental';

import {BookMenuComponent} from '../../../../shared/components/book-menu/book-menu.component';
import {
  type BookMenuCapabilities,
  type ReadStatusTarget,
} from '../../../../shared/components/book-menu/book-menu';
import {type ShelfMembershipItem} from '../../../../shared/components/shelf-menu/shelf-membership-menu.component';
import {type ContextMenuRequest} from '../../../../shared/ui/menu/app-menu.component';
import {UserService} from '../../../settings/user-management/user.service';
import {MetadataRefreshSubmissionService} from '../../../metadata/data/metadata-refresh-submission.service';
import {BookBackgroundSubmissionService} from '../../data/book-background-submission.service';
import {BookCommandService} from '../../data/book-command.service';
import {BookShelfCommandService} from '../../data/book-shelf-command.service';
import {ShelfDefinitionQueryService} from '../../data/shelf-definition-query.service';
import {type BookSummary} from '../../data/book-response.models';
import {
  injectPendingBookShelfMembership,
  overlayShelfIds,
} from '../../data/book-command-pending-state';
import {legacyBookCachePatches, withLegacyBookCache} from '../../service/book-command-legacy-adapter';
import {BookDialogHelperService} from '../../service/book-dialog-helper.service';
import {BookFileService} from '../../service/book-file.service';

@Component({
  selector: 'app-book-menu-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {class: 'contents'},
  imports: [BookMenuComponent],
  template: `
    <app-book-menu
      openInNewTab
      [book]="menuBook()"
      [capabilities]="capabilities()"
      [shelves]="shelves()"
      [readStatus]="readStatus()"
      (toggleShelf)="onToggleShelf($event.shelfId, $event.checked)"
      (setReadStatus)="onSetReadStatus($event)"
      (fetchMetadata)="onFetchMetadata()"
      (fetchMetadataWithOptions)="onFetchMetadataWithOptions()"
      (editMetadata)="onEditMetadata()"
      (metadataLockChange)="onMetadataLockChange($event)"
      (createShelf)="onCreateShelf()"
      (download)="onDownload()"
      (quickSend)="onQuickSend()"
      (customSend)="onCustomSend()"
      (deleteRequested)="onDeleteRequested()"
      (closed)="onMenuClosed()" />
  `,
})
export class BookMenuHostComponent {
  readonly books = input.required<readonly BookSummary[]>();
  readonly deleted = output<readonly number[]>();

  private readonly userService = inject(UserService);
  private readonly bookFileService = inject(BookFileService);
  private readonly dialogHelper = inject(BookDialogHelperService);
  private readonly metadataRefresh = inject(MetadataRefreshSubmissionService);
  private readonly backgroundSubmission = inject(BookBackgroundSubmissionService);
  private readonly bookCommands = inject(BookCommandService);
  private readonly shelfCommands = inject(BookShelfCommandService);
  private readonly shelfDefinitionQuery = inject(ShelfDefinitionQueryService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  private readonly menu = viewChild.required(BookMenuComponent);
  private readonly menuBookSnapshot = signal<BookSummary | null>(null);
  private readonly openMenuBookId = signal<number | null>(null);
  readonly openBookId = this.openMenuBookId.asReadonly();

  private readonly shelfDefinitionsQuery = injectQuery(() => this.shelfDefinitionQuery.definitions());
  private readonly pendingShelfMembership = injectPendingBookShelfMembership();

  private readonly shelfMembershipMutation = injectMutation(() => withLegacyBookCache(
    this.shelfCommands.updateMembership(), legacyBookCachePatches.shelfMembership));
  private readonly readStatusMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.setReadStatus(), legacyBookCachePatches.readStatus));
  private readonly refreshMetadataMutation = injectMutation(() =>
    this.metadataRefresh.refreshMetadata()
  );
  private readonly deleteBooksMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.deleteBooks(), legacyBookCachePatches.deleteBooks));
  private readonly metadataLocksMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.setAllMetadataLocks(), legacyBookCachePatches.metadataAllLocks));
  private readonly quickSendMutation = injectMutation(() => this.backgroundSubmission.quickSend());

  protected readonly menuBook = computed<BookSummary | null>(() => {
    const snapshot = this.menuBookSnapshot();
    if (!snapshot) {
      return null;
    }
    return this.books().find(book => book.id === snapshot.id) ?? snapshot;
  });
  protected readonly readStatus = computed(() => this.menuBook()?.readStatus ?? null);
  protected readonly capabilities = computed<BookMenuCapabilities>(() => {
    const permissions = this.userService.currentUser()?.permissions;
    return {
      canDownload: !!permissions?.canDownload,
      canEmailBook: !!permissions?.canEmailBook,
      canEditMetadata: !!permissions?.canEditMetadata,
      canDeleteBook: !!permissions?.canDeleteBook,
    };
  });
  protected readonly shelves = computed<ShelfMembershipItem[]>(() => {
    const book = this.menuBook();
    if (!book) {
      return [];
    }
    const onShelfIds = overlayShelfIds(book, this.pendingShelfMembership().get(book.id));
    const currentUserId = this.userService.currentUser()?.id;
    return (this.shelfDefinitionsQuery.data() ?? [])
      .filter(shelf => shelf.userId === currentUserId)
      .map(shelf => ({id: shelf.id, name: shelf.name, checked: onShelfIds.has(shelf.id)}));
  });

  openFromCard(book: BookSummary, request: ContextMenuRequest): void {
    if (!request.contextmenu && this.openMenuBookId() === book.id) {
      this.menu().close();
      return;
    }
    this.menuBookSnapshot.set(book);
    this.openMenuBookId.set(book.id);
    this.menu().openFromCard(request);
  }

  protected onMenuClosed(): void {
    this.openMenuBookId.set(null);
  }

  protected onToggleShelf(shelfId: number, checked: boolean): void {
    const book = this.menuBook()!;
    this.shelfMembershipMutation.mutate({
      bookIds: [book.id],
      assignShelfIds: checked ? [shelfId] : [],
      unassignShelfIds: checked ? [] : [shelfId],
    });
  }

  protected onSetReadStatus(status: ReadStatusTarget): void {
    const book = this.menuBook()!;
    this.readStatusMutation.mutate({bookIds: [book.id], status});
  }

  protected onFetchMetadata(): void {
    const book = this.menuBook()!;
    this.refreshMetadataMutation.mutate({bookIds: [book.id]});
  }

  protected onFetchMetadataWithOptions(): void {
    const book = this.menuBook()!;
    void this.dialogHelper.openMetadataRefreshDialog(new Set([book.id]));
  }

  protected onEditMetadata(): void {
    const book = this.menuBook()!;
    this.router.navigate(['/book', book.id], {queryParams: {tab: 'edit'}});
  }

  protected onMetadataLockChange(locked: boolean): void {
    const book = this.menuBook()!;
    this.metadataLocksMutation.mutate({bookIds: [book.id], locked});
  }

  protected onCreateShelf(): void {
    void this.dialogHelper.openShelfCreatorDialog();
  }

  protected onDownload(): void {
    const book = this.menuBook()!;
    this.bookFileService.downloadFile(book);
  }

  protected onQuickSend(): void {
    const book = this.menuBook()!;
    this.quickSendMutation.mutate({bookId: book.id});
  }

  protected onCustomSend(): void {
    const book = this.menuBook()!;
    void this.dialogHelper.openCustomSendDialog(book);
  }

  protected onDeleteRequested(): void {
    const book = this.menuBook()!;
    this.confirmationService.confirm({
      message: this.transloco.translate('book.card.confirm.deleteBookMessage', {title: book.metadata?.title}),
      header: this.transloco.translate('book.card.confirm.deleteBookHeader'),
      icon: 'pi pi-exclamation-triangle',
      acceptIcon: 'pi pi-trash',
      rejectIcon: 'pi pi-times',
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-outlined',
      accept: () => this.deleteBooksMutation.mutate({bookIds: [book.id]}, {
        onSuccess: result => this.deleted.emit(result.removedBookIds),
      }),
    });
  }
}
