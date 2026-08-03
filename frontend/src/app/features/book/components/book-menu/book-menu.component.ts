import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {Router} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {ConfirmationService} from '@openng/optimus-ui/api';
import {LucideSquareArrowOutUpRight, type LucideIconData} from '@lucide/angular';
import {injectMutation, injectQuery} from '@tanstack/angular-query-experimental';
import {API_CONFIG} from '../../../../core/config/api-config';

import {AppMenuComponent, type ContextMenuRequest} from '../../../../shared/ui/menu/app-menu.component';
import {AppMenuCheckboxComponent} from '../../../../shared/ui/menu/app-menu-checkbox.component';
import {AppMenuItemComponent} from '../../../../shared/ui/menu/app-menu-item.component';
import {AppMenuRadioGroupComponent} from '../../../../shared/ui/menu/app-menu-radio-group.component';
import {AppMenuRadioComponent} from '../../../../shared/ui/menu/app-menu-radio.component';
import {AppMenuSeparatorComponent} from '../../../../shared/ui/menu/app-menu-separator.component';
import {
  ShelfMembershipMenuComponent,
  type ShelfMembershipItem,
} from '../../../../shared/components/shelf-menu/shelf-membership-menu.component';
import {UserService} from '../../../settings/user-management/user.service';
import {MetadataRefreshSubmissionService} from '../../../metadata/data/metadata-refresh-submission.service';
import {BookBackgroundSubmissionService} from '../../data/book-background-submission.service';
import {BookCommandService} from '../../data/book-command.service';
import {BookShelfCommandService} from '../../data/book-shelf-command.service';
import {
  injectPendingBookShelfMembership,
  overlayShelfIds,
} from '../../data/book-command-pending-state';
import {type BookProgressSource} from '../../data/book-command.models';
import {
  type BookFileResponse,
  type BookSummary,
  type KnownBookReadStatus,
} from '../../data/book-response.models';
import {
  bookProgressPercentage,
  bookReadAction,
  BOOK_READ_ACTION_ICONS,
  BOOK_READ_ACTION_LONG_KEYS,
} from '../../data/book-read-action';
import {ShelfDefinitionQueryService} from '../../data/shelf-definition-query.service';
import {legacyBookCachePatches, withLegacyBookCache} from '../../service/book-command-legacy-adapter';
import {BookDialogHelperService} from '../../service/book-dialog-helper.service';
import {FileDownloadService} from '../../../../shared/service/file-download.service';
import {BookReadService} from '../../service/book-read.service';
import {
  bookAdditionalFiles,
  bookFileLabelParts,
  type BookFileLabelParts,
  bookHasDigitalFile,
  CLEAR_READ_STATUS,
  CLEAR_READ_STATUS_LABEL_KEY,
  isReadStatusTarget,
  READ_STATUS_TARGET_LABEL_KEYS,
  READ_STATUS_TARGETS,
  type BookMenuCapabilities,
  type ReadStatusTarget,
} from './book-menu';

const LARGE_EMAIL_FILE_KB = 25 * 1024;
const BOOKS_API_URL = `${API_CONFIG.BASE_URL}/api/v1/books`;

@Component({
  selector: 'app-book-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {class: 'contents'},
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    AppMenuComponent,
    AppMenuCheckboxComponent,
    AppMenuItemComponent,
    AppMenuRadioGroupComponent,
    AppMenuRadioComponent,
    AppMenuSeparatorComponent,
    ShelfMembershipMenuComponent,
  ],
  templateUrl: './book-menu.component.html',
})
export class BookMenuComponent {
  readonly books = input<readonly BookSummary[]>([]);
  readonly openInNewTab = input(false, {transform: booleanAttribute});

  readonly deleted = output<readonly number[]>();

  private readonly userService = inject(UserService);
  private readonly fileDownload = inject(FileDownloadService);
  private readonly bookRead = inject(BookReadService);
  private readonly dialogHelper = inject(BookDialogHelperService);
  private readonly metadataRefresh = inject(MetadataRefreshSubmissionService);
  private readonly backgroundSubmission = inject(BookBackgroundSubmissionService);
  private readonly bookCommands = inject(BookCommandService);
  private readonly shelfCommands = inject(BookShelfCommandService);
  private readonly shelfDefinitionQuery = inject(ShelfDefinitionQueryService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  private readonly rootMenu = viewChild.required(AppMenuComponent);
  private readonly bookSnapshot = signal<BookSummary | null>(null);
  private readonly openMenuBookId = signal<number | null>(null);
  readonly openBookId = this.openMenuBookId.asReadonly();

  private readonly shelfDefinitionsQuery = injectQuery(() => this.shelfDefinitionQuery.definitions());
  private readonly pendingShelfMembership = injectPendingBookShelfMembership();

  private readonly shelfMembershipMutation = injectMutation(() => withLegacyBookCache(
    this.shelfCommands.updateMembership(), legacyBookCachePatches.shelfMembership));
  private readonly readStatusMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.setReadStatus(), legacyBookCachePatches.readStatus));
  private readonly refreshMetadataMutation = injectMutation(() => this.metadataRefresh.refreshMetadata());
  private readonly deleteBooksMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.deleteBooks(), legacyBookCachePatches.deleteBooks));
  private readonly deleteBookFileMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.deleteBookFile(), legacyBookCachePatches.deleteBookFile));
  private readonly quickSendMutation = injectMutation(() => this.backgroundSubmission.quickSend());
  private readonly metadataLocksMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.setAllMetadataLocks(), legacyBookCachePatches.metadataAllLocks));
  private readonly resetProgressMutation = injectMutation(() => withLegacyBookCache(
    this.bookCommands.resetProgress(), legacyBookCachePatches.resetProgress));
  private readonly changeCoversMutation = injectMutation(() => this.backgroundSubmission.changeCovers());

  protected readonly readStatusTargets = READ_STATUS_TARGETS;
  protected readonly clearReadStatus = CLEAR_READ_STATUS;
  protected readonly clearReadStatusLabelKey = CLEAR_READ_STATUS_LABEL_KEY;

  protected readonly book = computed<BookSummary | null>(() => {
    const snapshot = this.bookSnapshot();
    if (!snapshot) {
      return null;
    }
    return this.books().find(book => book.id === snapshot.id) ?? snapshot;
  });
  protected readonly capabilities = computed<BookMenuCapabilities>(() => {
    const permissions = this.userService.currentUser()?.permissions;
    return {
      canDownload: !!permissions?.canDownload,
      canEmailBook: !!permissions?.canEmailBook,
      canEditMetadata: !!permissions?.canEditMetadata,
      canDeleteBook: !!permissions?.canDeleteBook,
      canResetGrimmoryProgress: !!permissions?.canBulkResetGrimmoryReadProgress,
      canResetKoreaderProgress: !!permissions?.canBulkResetKoReaderReadProgress,
    };
  });
  protected readonly shelves = computed<ShelfMembershipItem[]>(() => {
    const book = this.book();
    if (!book) {
      return [];
    }
    const onShelfIds = overlayShelfIds(book, this.pendingShelfMembership().get(book.id));
    const currentUserId = this.userService.currentUser()?.id;
    return (this.shelfDefinitionsQuery.data() ?? [])
      .filter(shelf => shelf.userId === currentUserId)
      .map(shelf => ({id: shelf.id, name: shelf.name, checked: onShelfIds.has(shelf.id)}));
  });
  protected readonly readable = computed(() => this.book()?.primaryFile != null);
  protected readonly readLabelKey = computed(() => {
    const book = this.book();
    return book ? BOOK_READ_ACTION_LONG_KEYS[bookReadAction(book)] : null;
  });
  protected readonly readProgress = computed(() => {
    const book = this.book();
    const action = book ? bookReadAction(book) : null;
    if (!book || (action !== 'continueReading' && action !== 'continueListening')) {
      return '';
    }
    return `${Math.max(1, Math.round(bookProgressPercentage(book) ?? 0))}%`;
  });
  protected readonly readIcon = computed<LucideIconData | undefined>(() => {
    const book = this.book();
    if (!book || this.readProgress()) {
      return undefined;
    }
    return BOOK_READ_ACTION_ICONS[bookReadAction(book)];
  });
  protected readonly newTabIcon: LucideIconData = LucideSquareArrowOutUpRight.icon;
  protected readonly digital = computed(() => {
    const book = this.book();
    return book ? bookHasDigitalFile(book) : false;
  });
  protected readonly additionalFiles = computed(() => bookAdditionalFiles(this.book()));
  protected readonly hasMoreActions = computed(() => {
    const capabilities = this.capabilities();
    return capabilities.canResetGrimmoryProgress || capabilities.canResetKoreaderProgress;
  });
  protected readonly readStatusTarget = computed<ReadStatusTarget | null>(() => {
    const status = this.book()?.readStatus ?? null;
    return status !== null && isReadStatusTarget(status) ? status : null;
  });

  openFor(book: BookSummary, request: ContextMenuRequest): void {
    if (!request.contextmenu && this.openMenuBookId() === book.id) {
      this.rootMenu().close();
      return;
    }
    this.bookSnapshot.set(book);
    this.openMenuBookId.set(book.id);
    this.rootMenu().openFrom(request);
  }

  close(): void {
    this.rootMenu().close();
  }

  protected statusLabelKey(status: ReadStatusTarget): string {
    return READ_STATUS_TARGET_LABEL_KEYS[status];
  }

  protected fileLabelParts(file: BookFileResponse): BookFileLabelParts {
    return bookFileLabelParts(file);
  }

  protected onClosed(): void {
    this.openMenuBookId.set(null);
  }

  protected onRead(): void {
    this.bookRead.readBook(this.book()!);
  }

  protected onToggleShelf(shelfId: number, checked: boolean): void {
    this.shelfMembershipMutation.mutate({
      bookIds: [this.book()!.id],
      assignShelfIds: checked ? [shelfId] : [],
      unassignShelfIds: checked ? [] : [shelfId],
    });
  }

  protected onRemoveFromAllShelves(): void {
    const shelfIds = this.shelves().filter(shelf => shelf.checked).map(shelf => shelf.id);
    if (shelfIds.length === 0) {
      return;
    }
    this.shelfMembershipMutation.mutate({
      bookIds: [this.book()!.id],
      assignShelfIds: [],
      unassignShelfIds: shelfIds,
    });
  }

  protected onCreateShelf(): void {
    void this.dialogHelper.openShelfCreatorDialog();
  }

  protected onSetReadStatus(status: KnownBookReadStatus): void {
    this.readStatusMutation.mutate({bookIds: [this.book()!.id], status});
  }

  protected onResetProgress(source: BookProgressSource): void {
    this.resetProgressMutation.mutate({bookIds: [this.book()!.id], source});
  }

  protected onSearchMetadata(): void {
    this.router.navigate(['/book', this.book()!.id], {queryParams: {tab: 'match'}});
  }

  protected onFetchMetadata(): void {
    this.refreshMetadataMutation.mutate({bookIds: [this.book()!.id]});
  }

  protected onFetchMetadataWithOptions(): void {
    void this.dialogHelper.openMetadataRefreshDialog(new Set([this.book()!.id]));
  }

  protected onEditMetadata(): void {
    this.router.navigate(['/book', this.book()!.id], {queryParams: {tab: 'edit'}});
  }

  protected onChangeCovers(kind: 'regenerate' | 'generate'): void {
    this.changeCoversMutation.mutate({kind, bookIds: [this.book()!.id]});
  }

  protected onMetadataLockChange(locked: boolean): void {
    this.metadataLocksMutation.mutate({bookIds: [this.book()!.id], locked});
  }

  protected onDownload(): void {
    const book = this.book()!;
    this.fileDownload.downloadFile(
      `${BOOKS_API_URL}/${book.id}/download`,
      book.primaryFile?.fileName ?? 'book',
    );
  }

  protected onDownloadFile(file: BookFileResponse): void {
    this.fileDownload.downloadFile(
      `${BOOKS_API_URL}/${this.book()!.id}/files/${file.id}/download`,
      file.fileName ?? 'file',
    );
  }

  protected onQuickSend(): void {
    const book = this.book()!;
    if ((book.primaryFile?.fileSizeKb ?? 0) <= LARGE_EMAIL_FILE_KB) {
      this.quickSend(book.id);
      return;
    }
    this.confirmationService.confirm({
      message: this.transloco.translate('book.menu.confirm.largeFileMessage'),
      header: this.transloco.translate('book.menu.confirm.largeFileHeader'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.transloco.translate('book.menu.confirm.sendAnyway'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonProps: {severity: 'warn'},
      rejectButtonProps: {severity: 'secondary'},
      accept: () => this.quickSend(book.id),
    });
  }

  protected onCustomSend(): void {
    void this.dialogHelper.openCustomSendDialog(this.book()!);
  }

  protected onDeleteRequested(): void {
    const book = this.book()!;
    this.confirmationService.confirm({
      message: this.transloco.translate('book.menu.confirm.deleteBookMessage', {title: book.metadata?.title}),
      header: this.transloco.translate('book.menu.confirm.deleteBookHeader'),
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

  protected onDeleteFileRequested(file: BookFileResponse): void {
    const book = this.book()!;
    const fileName = file.fileName ?? '';
    this.confirmationService.confirm({
      message: this.transloco.translate('book.menu.confirm.deleteFileMessage', {fileName}),
      header: this.transloco.translate('book.menu.confirm.deleteFileHeader'),
      icon: 'pi pi-exclamation-triangle',
      acceptIcon: 'pi pi-trash',
      rejectIcon: 'pi pi-times',
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-outlined',
      accept: () => this.deleteBookFileMutation.mutate({bookId: book.id, fileId: file.id}),
    });
  }

  private quickSend(bookId: number): void {
    this.quickSendMutation.mutate({bookId});
  }
}
