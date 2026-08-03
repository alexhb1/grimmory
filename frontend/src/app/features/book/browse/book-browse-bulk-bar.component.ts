import {ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild} from '@angular/core';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {ConfirmationService, MessageService} from '@openng/optimus-ui/api';
import {injectMutation, injectQuery} from '@tanstack/angular-query-experimental';
import {LucideBookmark, LucideCheck, LucideDatabase, LucideEllipsis, LucidePenLine} from '@lucide/angular';
import {take} from 'rxjs/operators';

import {
  READ_STATUS_TARGET_LABEL_KEYS,
  READ_STATUS_TARGETS,
  type BookMenuCapabilities,
  type ReadStatusTarget,
} from '../../../shared/components/book-menu/book-menu';
import {
  BulkActionsBarComponent,
  BulkActionsDividerComponent,
} from '../../../shared/components/bulk-actions/bulk-actions-bar.component';
import {ShelfMembershipMenuComponent} from '../../../shared/components/shelf-menu/shelf-membership-menu.component';
import {AppButtonComponent} from '../../../shared/ui/button/app-button.component';
import {AppMenuComponent} from '../../../shared/ui/menu/app-menu.component';
import {AppMenuItemComponent} from '../../../shared/ui/menu/app-menu-item.component';
import {AppMenuSeparatorComponent} from '../../../shared/ui/menu/app-menu-separator.component';
import {AppMenuTriggerDirective} from '../../../shared/ui/menu/app-menu-trigger.directive';
import {LayoutService} from '../../../shared/layout/layout.service';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {DeleteBooksPartialError, type BookProgressSource} from '../data/book-command.models';
import {
  injectPendingBookDeletions,
  injectPendingBookShelfMembership,
  overlayShelfIds,
} from '../data/book-command-pending-state';
import {type BookSummary} from '../data/book-response.models';
import {ShelfDefinitionQueryService} from '../data/shelf-definition-query.service';
import {BookBackgroundSubmissionService} from '../data/book-background-submission.service';
import {BookCommandService} from '../data/book-command.service';
import {BookShelfCommandService} from '../data/book-shelf-command.service';
import {MetadataRefreshSubmissionService} from '../../metadata/data/metadata-refresh-submission.service';
import {UserService} from '../../settings/user-management/user.service';
import {type BookFileAttacherSourceBook} from '../components/book-file-attacher/book-file-attacher.component';
import {BookDialogHelperService} from '../service/book-dialog-helper.service';
import {legacyBookCachePatches, withLegacyBookCache} from '../service/book-command-legacy-adapter';
import {resolveSelectedBookIds, type BookBrowseSelection} from './book-browse-selection';

const BULK_BAR_WIDTHS = {
  frame: 46,
  fixedSection: 245,
  addToShelf: 132,
  markAs: 100,
  more: 40,
  edit: 84,
  metadata: 110,
  deleteGroup: 88,
};

@Component({
  selector: 'app-book-browse-bulk-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {class: 'contents'},
  imports: [
    TranslocoPipe,
    AppButtonComponent,
    AppMenuComponent,
    AppMenuItemComponent,
    AppMenuSeparatorComponent,
    AppMenuTriggerDirective,
    BulkActionsBarComponent,
    BulkActionsDividerComponent,
    ShelfMembershipMenuComponent,
    LucideBookmark,
    LucideCheck,
    LucideDatabase,
    LucideEllipsis,
    LucidePenLine,
  ],
  template: `
    @if (selection().active()) {
      <app-bulk-actions-bar
        [count]="selection().count()"
        [total]="total()"
        (clearSelection)="selection().clear()"
        (selectAll)="selection().selectAll()">
        <app-bulk-actions-divider />
        @if (bulkBarShowsAddToShelf()) {
          <app-button
            variant="ghost"
            size="md"
            [disabled]="isResolving()"
            [label]="'shared.ui.bookMenu.addToShelf' | transloco"
            [appMenuTriggerFor]="bulkShelfMenuHost.menu()">
            <svg lucideBookmark aria-hidden="true"></svg>
          </app-button>
        }
        @if (bulkBarShowsMarkAs()) {
          <app-button
            variant="ghost"
            size="md"
            [disabled]="isResolving()"
            [label]="'shared.ui.bookMenu.markAs' | transloco"
            [appMenuTriggerFor]="bulkMarkAsMenu">
            <svg lucideCheck aria-hidden="true"></svg>
          </app-button>
        }
        @if (bulkBarShowsEdit()) {
          <app-button
            variant="ghost"
            size="md"
            [disabled]="isResolving()"
            [label]="'common.edit' | transloco"
            [appMenuTriggerFor]="bulkEditMenu">
            <svg lucidePenLine aria-hidden="true"></svg>
          </app-button>
        }
        @if (bulkBarShowsMetadata()) {
          <app-button
            variant="ghost"
            size="md"
            [disabled]="isResolving()"
            [label]="'book.card.menu.metadata' | transloco"
            [appMenuTriggerFor]="bulkMetadataMenu">
            <svg lucideDatabase aria-hidden="true"></svg>
          </app-button>
        }
        @if (bulkMoreMenuHasItems()) {
          <app-button
            variant="ghost"
            size="md"
            iconOnly
            [disabled]="isResolving()"
            [ariaLabel]="'book.card.menu.moreActions' | transloco"
            [appMenuTriggerFor]="bulkMoreMenu">
            <svg lucideEllipsis aria-hidden="true"></svg>
          </app-button>
        }
        @if (bulkBarShowsDelete()) {
          <app-bulk-actions-divider />
          <app-button
            variant="ghost"
            tone="danger"
            size="md"
            [label]="'common.delete' | transloco"
            [loading]="bulkDeleting()"
            [disabled]="isResolving()"
            (clicked)="onBulkDelete()" />
        }
      </app-bulk-actions-bar>

      <app-shelf-membership-menu
        #bulkShelfMenuHost
        [shelves]="bulkShelves()"
        (toggleShelf)="onBulkToggleShelf($event.shelfId, $event.checked)"
        (createShelf)="onCreateShelf()" />

      <app-menu #bulkMarkAsMenu #bulkMarkAsAria="ngMenu" [ariaLabel]="'shared.ui.bookMenu.markAs' | transloco">
        @for (status of readStatusTargets; track status) {
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkMarkAs(status)">{{ statusLabelKey(status) | transloco }}</app-menu-item>
        }
      </app-menu>

      <app-menu #bulkEditMenu #bulkEditAria="ngMenu" [ariaLabel]="'common.edit' | transloco">
        <app-menu-item [disabled]="isResolving()" (selected)="onBulkEditAll()">{{ 'browse.bulk.editAll' | transloco }}</app-menu-item>
        <app-menu-item [disabled]="isResolving()" (selected)="onBulkEditOneByOne()">{{ 'browse.bulk.editOneByOne' | transloco }}</app-menu-item>
      </app-menu>

      <app-menu #bulkMetadataMenu #bulkMetadataAria="ngMenu" [ariaLabel]="'book.card.menu.metadata' | transloco">
        @if (menuCapabilities().canEditMetadata) {
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkFetchMetadata()">{{ 'metadata.viewer.fetchMetadataBtn' | transloco }}</app-menu-item>
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkFetchMetadataWithOptions()">{{ 'shared.ui.bookMenu.fetchMetadataWithOptions' | transloco }}</app-menu-item>
        }
        @if (menuCapabilities().canEditMetadata && canBulkLockUnlockMetadata()) {
          <app-menu-separator />
        }
        @if (canBulkLockUnlockMetadata()) {
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkSetMetadataLocks(true)">{{ 'metadata.editor.lockAllBtn' | transloco }}</app-menu-item>
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkSetMetadataLocks(false)">{{ 'metadata.editor.unlockAllBtn' | transloco }}</app-menu-item>
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkLockUnlockMetadata()">{{ 'book.browser.tooltip.lockUnlockMetadata' | transloco }}</app-menu-item>
        }
        @if (menuCapabilities().canEditMetadata) {
          <app-menu-separator />
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkChangeCovers('regenerate')">{{ 'book.menuService.menu.regenerateCovers' | transloco }}</app-menu-item>
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkChangeCovers('generate')">{{ 'browse.bulk.customCovers' | transloco }}</app-menu-item>
        }
      </app-menu>

      <app-menu #bulkMoreMenu [ariaLabel]="'book.card.menu.moreActions' | transloco">
        @if (!bulkBarShowsMarkAs() || (bulkMetadataAvailable() && !bulkBarShowsMetadata())) {
          @if (!bulkBarShowsAddToShelf()) {
            <app-menu-item [disabled]="isResolving()" [submenu]="bulkShelfMenuHost.ariaMenu()">{{ 'shared.ui.bookMenu.addToShelf' | transloco }}</app-menu-item>
          }
          @if (!bulkBarShowsMarkAs()) {
            <app-menu-item [disabled]="isResolving()" [submenu]="bulkMarkAsAria">{{ 'shared.ui.bookMenu.markAs' | transloco }}</app-menu-item>
          }
          @if (bulkMetadataAvailable() && !bulkBarShowsMetadata()) {
            @if (menuCapabilities().canEditMetadata && !bulkBarShowsEdit()) {
              <app-menu-item [disabled]="isResolving()" [submenu]="bulkEditAria">{{ 'common.edit' | transloco }}</app-menu-item>
            }
            <app-menu-item [disabled]="isResolving()" [submenu]="bulkMetadataAria">{{ 'book.card.menu.metadata' | transloco }}</app-menu-item>
          }
          @if (canBulkResetGrimmory()
            || canBulkResetKoreader()
            || canBulkOrganizeFiles()
            || canBulkAttachFiles()
            || (menuCapabilities().canDeleteBook && !bulkBarShowsDelete())) {
            <app-menu-separator />
          }
        }
        @if (canBulkResetGrimmory()) {
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkResetProgress('GRIMMORY')">{{ 'book.menuService.menu.resetGrimmoryProgress' | transloco }}</app-menu-item>
        }
        @if (canBulkResetKoreader()) {
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkResetProgress('KOREADER')">{{ 'book.menuService.menu.resetKOReaderProgress' | transloco }}</app-menu-item>
        }
        @if ((canBulkResetGrimmory() || canBulkResetKoreader())
          && (canBulkOrganizeFiles()
            || canBulkAttachFiles()
            || (menuCapabilities().canDeleteBook && !bulkBarShowsDelete()))) {
          <app-menu-separator />
        }
        @if (canBulkOrganizeFiles()) {
          <app-menu-item [disabled]="isResolving()" (selected)="onBulkOrganizeFiles()">{{ 'book.browser.tooltip.organizeFiles' | transloco }}</app-menu-item>
        }
        @if (canBulkAttachFiles()) {
          <app-menu-item [disabled]="!bulkAttachEligible() || isResolving()" (selected)="onBulkAttachFiles()">
            {{ 'book.fileAttacher.attachFilesBulk' | transloco }}
          </app-menu-item>
        }
        @if ((canBulkOrganizeFiles() || canBulkAttachFiles())
          && menuCapabilities().canDeleteBook
          && !bulkBarShowsDelete()) {
          <app-menu-separator />
        }
        @if (menuCapabilities().canDeleteBook && !bulkBarShowsDelete()) {
          <app-menu-item variant="destructive" [loading]="bulkDeleting()" [disabled]="isResolving()" (selected)="onBulkDelete()">
            {{ 'common.delete' | transloco }}
          </app-menu-item>
        }
      </app-menu>
    }
  `,
})
export class BookBrowseBulkBarComponent {
  readonly selection = input.required<BookBrowseSelection>();
  readonly books = input.required<readonly BookSummary[]>();
  readonly total = input.required<number | null>();
  readonly resolveIds = input.required<() => Promise<readonly number[]>>();

  private readonly layout = inject(LayoutService);
  private readonly transloco = inject(TranslocoService);
  private readonly userService = inject(UserService);
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly shelfDefinitionQuery = inject(ShelfDefinitionQueryService);
  private readonly dialogHelper = inject(BookDialogHelperService);
  private readonly metadataRefresh = inject(MetadataRefreshSubmissionService);
  private readonly backgroundSubmission = inject(BookBackgroundSubmissionService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly bookCommands = inject(BookCommandService);
  private readonly shelfCommands = inject(BookShelfCommandService);

  private readonly shelfDefinitionsQuery = injectQuery(() => this.shelfDefinitionQuery.definitions());
  private readonly pendingShelfMembership = injectPendingBookShelfMembership();
  private readonly pendingDeletions = injectPendingBookDeletions();
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

  private readonly bulkBar = viewChild(BulkActionsBarComponent);
  private readonly isMobile = computed(() => !this.layout.isDesktop());
  protected readonly isResolving = signal(false);
  protected readonly readStatusTargets = READ_STATUS_TARGETS;

  protected readonly menuCapabilities = computed<BookMenuCapabilities>(() => {
    const permissions = this.userService.currentUser()?.permissions;
    return {
      canDownload: !!permissions?.canDownload,
      canEmailBook: !!permissions?.canEmailBook,
      canEditMetadata: !!permissions?.canEditMetadata,
      canDeleteBook: !!permissions?.canDeleteBook,
    };
  });

  private readonly bulkBarFit = computed(() => {
    const available = this.bulkBar()?.availableWidth() ?? 0;
    const capabilities = this.menuCapabilities();
    const w = BULK_BAR_WIDTHS;
    let used = w.frame + w.more + (this.isMobile() ? 0 : w.fixedSection);
    let fitting = true;
    const take = (width: number): boolean => {
      fitting = fitting && used + width <= available;
      if (fitting) used += width;
      return fitting;
    };
    return {
      addToShelf: take(w.addToShelf),
      markAs: take(w.markAs),
      edit: capabilities.canEditMetadata && take(w.edit),
      metadata: this.bulkMetadataAvailable() && take(w.metadata),
      delete: capabilities.canDeleteBook && take(w.deleteGroup),
    };
  });
  protected readonly bulkBarShowsAddToShelf = computed(() => this.bulkBarFit().addToShelf);
  protected readonly bulkBarShowsMarkAs = computed(() => this.bulkBarFit().markAs);
  protected readonly bulkBarShowsEdit = computed(() => this.bulkBarFit().edit);
  protected readonly bulkBarShowsMetadata = computed(() => this.bulkBarFit().metadata);
  protected readonly bulkBarShowsDelete = computed(() => this.bulkBarFit().delete);

  private readonly bulkEvidence = computed(() => {
    const books = this.books();
    const selection = this.selection();
    const evidenced: BookSummary[] = [];
    let loadedCount = 0;
    for (const book of books) {
      loadedCount++;
      if (selection.isSelected(book.id)) {
        evidenced.push(book);
      }
    }
    const complete = selection.state().mode === 'explicit'
      ? evidenced.length === selection.count()
      : loadedCount === this.total();
    return {evidenced, complete};
  });

  protected readonly bulkShelves = computed(() => {
    const {evidenced, complete} = this.bulkEvidence();
    const currentUserId = this.userService.currentUser()?.id;
    const pendingShelfMembership = this.pendingShelfMembership();
    const shelfIdsByBook = evidenced.map(book =>
      overlayShelfIds(book, pendingShelfMembership.get(book.id)),
    );
    return (this.shelfDefinitionsQuery.data() ?? [])
      .filter(shelf => shelf.userId === currentUserId)
      .map(shelf => {
      let onCount = 0;
      for (const shelfIds of shelfIdsByBook) {
        if (shelfIds.has(shelf.id)) {
          onCount++;
        }
      }
      const checked = complete && evidenced.length > 0 && onCount === evidenced.length;
      return {
        id: shelf.id,
        name: shelf.name,
        checked,
        mixed: !checked && (onCount > 0 || !complete),
      };
      });
  });

  protected readonly canBulkResetGrimmory = computed(() =>
    !!this.userService.currentUser()?.permissions.canBulkResetGrimmoryReadProgress,
  );
  protected readonly canBulkLockUnlockMetadata = computed(() =>
    !!this.userService.currentUser()?.permissions.canBulkLockUnlockMetadata,
  );
  protected readonly bulkMetadataAvailable = computed(() =>
    this.menuCapabilities().canEditMetadata || this.canBulkLockUnlockMetadata(),
  );
  protected readonly canBulkResetKoreader = computed(() =>
    !!this.userService.currentUser()?.permissions.canBulkResetKoReaderReadProgress,
  );
  protected readonly canBulkOrganizeFiles = computed(() =>
    !!this.userService.currentUser()?.permissions.canMoveOrganizeFiles
      && this.appSettingsService.appSettings()?.diskType === 'LOCAL',
  );
  protected readonly canBulkAttachFiles = computed(() => {
    const permissions = this.userService.currentUser()?.permissions;
    return !!permissions?.canManageLibrary || !!permissions?.admin;
  });
  protected readonly bulkAttachEligible = computed(() => {
    const {evidenced, complete} = this.bulkEvidence();
    return complete
      && new Set(evidenced.map(book => book.libraryId)).size === 1;
  });
  protected readonly bulkMoreMenuHasItems = computed(() => {
    const capabilities = this.menuCapabilities();
    return !this.bulkBarShowsAddToShelf()
      || !this.bulkBarShowsMarkAs()
      || (this.bulkMetadataAvailable() && !this.bulkBarShowsMetadata())
      || this.canBulkResetGrimmory()
      || this.canBulkResetKoreader()
      || this.canBulkOrganizeFiles()
      || this.canBulkAttachFiles()
      || (capabilities.canDeleteBook && !this.bulkBarShowsDelete());
  });
  protected readonly bulkDeleting = computed(() => this.pendingDeletions().size > 0);

  protected statusLabelKey(status: ReadStatusTarget): string {
    return READ_STATUS_TARGET_LABEL_KEYS[status];
  }

  private async withSelectedBookIds(run: (bookIds: readonly number[]) => void): Promise<void> {
    if (this.isResolving()) {
      return;
    }
    this.isResolving.set(true);
    let bookIds: readonly number[];
    try {
      bookIds = await resolveSelectedBookIds(this.selection().state(), this.resolveIds());
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
      this.selection().clear();
      this.messageService.add({
        severity: 'info',
        summary: this.transloco.translate('browse.bulk.selectionEmpty'),
      });
      return;
    }
    run(bookIds);
  }

  protected onBulkToggleShelf(shelfId: number, checked: boolean): void {
    void this.withSelectedBookIds(bookIds => this.shelfMembershipMutation.mutate({
      bookIds: [...bookIds],
      assignShelfIds: checked ? [shelfId] : [],
      unassignShelfIds: checked ? [] : [shelfId],
    }));
  }

  protected onBulkEditAll(): void {
    void this.withSelectedBookIds(bookIds => void this.dialogHelper
      .openBulkMetadataEditDialog(new Set(bookIds))
      .then(ref => ref?.onClose.pipe(take(1)).subscribe(() => this.selection().clear())));
  }

  protected onBulkEditOneByOne(): void {
    void this.withSelectedBookIds(bookIds => void this.dialogHelper
      .openMultibookMetadataEditorDialog(new Set(bookIds))
      .then(ref => ref?.onClose.pipe(take(1)).subscribe(() => this.selection().clear())));
  }

  protected onBulkLockUnlockMetadata(): void {
    void this.withSelectedBookIds(bookIds => void this.dialogHelper
      .openLockUnlockMetadataDialog(new Set(bookIds))
      .then(ref => ref?.onClose.pipe(take(1)).subscribe(() => this.selection().clear())));
  }

  protected onBulkOrganizeFiles(): void {
    void this.withSelectedBookIds(bookIds => void this.dialogHelper
      .openFileMoverDialog(new Set(bookIds)));
  }

  protected onCreateShelf(): void {
    void this.dialogHelper.openShelfCreatorDialog();
  }

  protected onBulkAttachFiles(): void {
    const sourceBooks: BookFileAttacherSourceBook[] = [];
    for (const book of this.books()) {
      if (this.selection().isSelected(book.id)) {
        sourceBooks.push(book);
      }
    }
    void this.dialogHelper.openBulkBookFileAttacherDialog(sourceBooks)
      .then(ref => ref?.onClose.pipe(take(1)).subscribe((result: {success?: boolean} | undefined) => {
        if (result?.success) {
          this.selection().clear();
        }
      }));
  }

  protected onBulkResetProgress(source: BookProgressSource): void {
    void this.withSelectedBookIds(bookIds => this.resetProgressMutation.mutate({bookIds: [...bookIds], source}));
  }

  protected onBulkSetMetadataLocks(locked: boolean): void {
    void this.withSelectedBookIds(bookIds => this.metadataLocksMutation.mutate({bookIds: [...bookIds], locked}));
  }

  protected onBulkChangeCovers(kind: 'regenerate' | 'generate'): void {
    const regenerate = kind === 'regenerate';
    this.confirmationService.confirm({
      message: this.transloco.translate(
        regenerate ? 'book.browser.confirm.regenCoverMessage' : 'book.browser.confirm.customCoverMessage',
        {count: this.selection().count().toLocaleString()},
      ),
      header: this.transloco.translate(
        regenerate ? 'book.browser.confirm.regenCoverHeader' : 'book.browser.confirm.customCoverHeader',
      ),
      acceptLabel: this.transloco.translate('common.confirm'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => {
        void this.withSelectedBookIds(bookIds => this.changeCoversMutation.mutate({kind, bookIds: [...bookIds]}));
      },
    });
  }

  protected onBulkFetchMetadata(): void {
    void this.withSelectedBookIds(bookIds => this.refreshMetadataMutation.mutate({bookIds: [...bookIds]}));
  }

  protected onBulkFetchMetadataWithOptions(): void {
    void this.withSelectedBookIds(bookIds => void this.dialogHelper
      .openMetadataRefreshDialog(new Set(bookIds)));
  }

  protected onBulkDelete(): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('book.browser.confirm.deleteMessage', {
        count: this.selection().count().toLocaleString(),
      }),
      header: this.transloco.translate('book.browser.confirm.deleteHeader'),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-outlined',
      accept: () => {
        void this.withSelectedBookIds(bookIds => this.deleteBooksMutation.mutate({bookIds: [...bookIds]}, {
          onSuccess: result => {
            this.selection().pruneDeleted(result.removedBookIds);
          },
          onError: error => {
            if (error instanceof DeleteBooksPartialError) {
              this.selection().pruneDeleted(error.completed.removedBookIds);
            }
          },
        }));
      },
    });
  }

  protected onBulkMarkAs(status: ReadStatusTarget): void {
    const statusLabel: string = this.transloco.translate(READ_STATUS_TARGET_LABEL_KEYS[status]);
    this.confirmationService.confirm({
      header: this.transloco.translate('book.menuService.menu.updateReadStatus'),
      message: this.transloco.translate('browse.bulk.markAsMessage', {
        count: this.selection().count().toLocaleString(),
        status: statusLabel,
      }),
      acceptLabel: this.transloco.translate('common.confirm'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => {
        void this.withSelectedBookIds(bookIds => this.readStatusMutation.mutate({bookIds: [...bookIds], status}));
      },
    });
  }
}
