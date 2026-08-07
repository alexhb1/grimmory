import {ChangeDetectionStrategy, Component, computed, inject, input, viewChild} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {injectQuery} from '@tanstack/angular-query-experimental';
import {LucideBookmark, LucideCheck, LucideDatabase, LucideEllipsis, LucidePenLine} from '@lucide/angular';

import {
  CLEAR_READ_STATUS,
  CLEAR_READ_STATUS_LABEL_KEY,
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
import {
  injectPendingBookDeletions,
  injectPendingBookShelfMembership,
  overlayShelfIds,
} from '../data/book-command-pending-state';
import {type BookSummary} from '../data/book-response.models';
import {ShelfDefinitionQueryService} from '../data/shelf-definition-query.service';
import {UserService} from '../../settings/user-management/user.service';
import {type BookBrowseSelection} from './book-browse-selection';
import {BookBulkCommandsService} from './book-bulk-commands.service';

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
  providers: [BookBulkCommandsService],
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
            (clicked)="commands.delete(selection(), resolveIds())" />
        }
      </app-bulk-actions-bar>

      <app-shelf-membership-menu
        #bulkShelfMenuHost
        [shelves]="bulkShelves()"
        (toggleShelf)="commands.toggleShelf(selection(), resolveIds(), $event.shelfId, $event.checked)"
        (createShelf)="commands.createShelf()"
        (removeFromAllShelves)="commands.removeFromAllShelves(selection(), resolveIds(), bulkShelfIds())" />

      <app-menu #bulkMarkAsMenu #bulkMarkAsAria="ngMenu" [ariaLabel]="'shared.ui.bookMenu.markAs' | transloco">
        @for (status of readStatusTargets; track status) {
          <app-menu-item [disabled]="isResolving()" (selected)="commands.markAs(selection(), resolveIds(), status)">{{ statusLabelKey(status) | transloco }}</app-menu-item>
        }
        <app-menu-separator />
        <app-menu-item [disabled]="isResolving()" (selected)="commands.markAs(selection(), resolveIds(), clearReadStatus)">
          {{ clearReadStatusLabelKey | transloco }}
        </app-menu-item>
      </app-menu>

      <app-menu #bulkEditMenu #bulkEditAria="ngMenu" [ariaLabel]="'common.edit' | transloco">
        <app-menu-item [disabled]="isResolving()" (selected)="commands.editAll(selection(), resolveIds())">{{ 'browse.bulk.editAll' | transloco }}</app-menu-item>
        <app-menu-item [disabled]="isResolving()" (selected)="commands.editOneByOne(selection(), resolveIds())">{{ 'browse.bulk.editOneByOne' | transloco }}</app-menu-item>
      </app-menu>

      <app-menu #bulkMetadataMenu #bulkMetadataAria="ngMenu" [ariaLabel]="'book.card.menu.metadata' | transloco">
        @if (menuCapabilities().canEditMetadata) {
          <app-menu-item [disabled]="isResolving()" (selected)="commands.fetchMetadata(selection(), resolveIds())">{{ 'metadata.viewer.fetchMetadataBtn' | transloco }}</app-menu-item>
          <app-menu-item [disabled]="isResolving()" (selected)="commands.fetchMetadataWithOptions(selection(), resolveIds())">{{ 'shared.ui.bookMenu.fetchMetadataWithOptions' | transloco }}</app-menu-item>
        }
        @if (menuCapabilities().canEditMetadata && canBulkLockUnlockMetadata()) {
          <app-menu-separator />
        }
        @if (canBulkLockUnlockMetadata()) {
          <app-menu-item [disabled]="isResolving()" (selected)="commands.setMetadataLocks(selection(), resolveIds(), true)">{{ 'metadata.editor.lockAllBtn' | transloco }}</app-menu-item>
          <app-menu-item [disabled]="isResolving()" (selected)="commands.setMetadataLocks(selection(), resolveIds(), false)">{{ 'metadata.editor.unlockAllBtn' | transloco }}</app-menu-item>
          <app-menu-item [disabled]="isResolving()" (selected)="commands.lockUnlockMetadata(selection(), resolveIds())">{{ 'book.browser.tooltip.lockUnlockMetadata' | transloco }}</app-menu-item>
        }
        @if (menuCapabilities().canEditMetadata) {
          <app-menu-separator />
          <app-menu-item [disabled]="isResolving()" (selected)="commands.changeCovers(selection(), resolveIds(), 'regenerate')">{{ 'book.menuService.menu.regenerateCovers' | transloco }}</app-menu-item>
          <app-menu-item [disabled]="isResolving()" (selected)="commands.changeCovers(selection(), resolveIds(), 'generate')">{{ 'browse.bulk.customCovers' | transloco }}</app-menu-item>
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
          <app-menu-item [disabled]="isResolving()" (selected)="commands.resetProgress(selection(), resolveIds(), 'GRIMMORY')">{{ 'book.menuService.menu.resetGrimmoryProgress' | transloco }}</app-menu-item>
        }
        @if (canBulkResetKoreader()) {
          <app-menu-item [disabled]="isResolving()" (selected)="commands.resetProgress(selection(), resolveIds(), 'KOREADER')">{{ 'book.menuService.menu.resetKOReaderProgress' | transloco }}</app-menu-item>
        }
        @if ((canBulkResetGrimmory() || canBulkResetKoreader())
          && (canBulkOrganizeFiles()
            || canBulkAttachFiles()
            || (menuCapabilities().canDeleteBook && !bulkBarShowsDelete()))) {
          <app-menu-separator />
        }
        @if (canBulkOrganizeFiles()) {
          <app-menu-item [disabled]="isResolving()" (selected)="commands.organizeFiles(selection(), resolveIds())">{{ 'book.browser.tooltip.organizeFiles' | transloco }}</app-menu-item>
        }
        @if (canBulkAttachFiles()) {
          <app-menu-item [disabled]="!bulkAttachEligible() || isResolving()" (selected)="commands.attachFiles(selection(), books())">
            {{ 'book.fileAttacher.attachFilesBulk' | transloco }}
          </app-menu-item>
        }
        @if ((canBulkOrganizeFiles() || canBulkAttachFiles())
          && menuCapabilities().canDeleteBook
          && !bulkBarShowsDelete()) {
          <app-menu-separator />
        }
        @if (menuCapabilities().canDeleteBook && !bulkBarShowsDelete()) {
          <app-menu-item variant="destructive" [loading]="bulkDeleting()" [disabled]="isResolving()" (selected)="commands.delete(selection(), resolveIds())">
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
  private readonly userService = inject(UserService);
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly shelfDefinitionQuery = inject(ShelfDefinitionQueryService);
  protected readonly commands = inject(BookBulkCommandsService);

  private readonly shelfDefinitionsQuery = injectQuery(() => this.shelfDefinitionQuery.definitions());
  private readonly pendingShelfMembership = injectPendingBookShelfMembership();
  private readonly pendingDeletions = injectPendingBookDeletions();

  private readonly bulkBar = viewChild(BulkActionsBarComponent);
  private readonly isMobile = computed(() => !this.layout.isDesktop());
  protected readonly isResolving = this.commands.isResolving;
  protected readonly readStatusTargets = READ_STATUS_TARGETS;
  protected readonly clearReadStatus = CLEAR_READ_STATUS;
  protected readonly clearReadStatusLabelKey = CLEAR_READ_STATUS_LABEL_KEY;

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
  protected readonly bulkShelfIds = computed(() => this.bulkShelves().map(shelf => shelf.id));

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
}
