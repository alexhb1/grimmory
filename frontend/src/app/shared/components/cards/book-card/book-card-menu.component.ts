import {ChangeDetectionStrategy, Component, computed, input, output, viewChild} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';

import {AppMenuComponent} from '../../../ui/menu/app-menu.component';
import {AppMenuCheckboxComponent} from '../../../ui/menu/app-menu-checkbox.component';
import {AppMenuItemComponent} from '../../../ui/menu/app-menu-item.component';
import {AppMenuRadioGroupComponent} from '../../../ui/menu/app-menu-radio-group.component';
import {AppMenuRadioComponent} from '../../../ui/menu/app-menu-radio.component';
import {AppMenuSeparatorComponent} from '../../../ui/menu/app-menu-separator.component';
import {ShelfMembershipMenuComponent} from '../../shelf-menu/shelf-membership-menu.component';
import {BookReadStatus, BookSummary} from '../../../../features/book/data/book-response.models';
import {
  bookHasDigitalFile,
  isReadStatusTarget,
  READ_STATUS_TARGET_LABEL_KEYS,
  READ_STATUS_TARGETS,
  type BookCardMenuCapabilities,
  type BookCardMenuShelf,
  type ReadStatusTarget,
} from './book-card-menu';

@Component({
  selector: 'app-book-card-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {class: 'contents'},
  imports: [
    TranslocoPipe,
    AppMenuComponent,
    AppMenuCheckboxComponent,
    AppMenuItemComponent,
    AppMenuRadioGroupComponent,
    AppMenuRadioComponent,
    AppMenuSeparatorComponent,
    ShelfMembershipMenuComponent,
  ],
  templateUrl: './book-card-menu.component.html',
})
export class BookCardMenuComponent {
  readonly book = input<BookSummary | null>(null);
  readonly capabilities = input.required<BookCardMenuCapabilities>();
  readonly shelves = input<BookCardMenuShelf[]>([]);
  readonly readStatus = input<BookReadStatus | null>(null);

  readonly toggleShelf = output<{shelf: BookCardMenuShelf; checked: boolean}>();
  readonly createShelf = output<void>();
  readonly setReadStatus = output<ReadStatusTarget>();
  readonly quickSend = output<void>();
  readonly customSend = output<void>();
  readonly download = output<void>();
  readonly fetchMetadata = output<void>();
  readonly fetchMetadataWithOptions = output<void>();
  readonly editMetadata = output<void>();
  readonly metadataLockChange = output<boolean>();
  readonly deleteRequested = output<void>();
  readonly opened = output<void>();
  readonly closed = output<void>();

  private readonly rootMenu = viewChild.required(AppMenuComponent);

  protected readonly readStatusTargets = READ_STATUS_TARGETS;

  protected readonly digital = computed(() => {
    const book = this.book();
    return book ? bookHasDigitalFile(book) : false;
  });

  protected statusLabelKey(status: ReadStatusTarget): string {
    return READ_STATUS_TARGET_LABEL_KEYS[status];
  }

  protected onReadStatusSelected(status: BookReadStatus): void {
    if (isReadStatusTarget(status)) {
      this.setReadStatus.emit(status);
    }
  }

  protected onToggleShelf(event: {shelfId: number; checked: boolean}): void {
    const shelf = this.shelves().find(entry => entry.id === event.shelfId);
    if (shelf) {
      this.toggleShelf.emit({shelf, checked: event.checked});
    }
  }

  open(origin: HTMLElement): void {
    this.rootMenu().open(origin);
  }

  openAt(x: number, y: number, contextZone?: HTMLElement): void {
    this.rootMenu().openAt(x, y, contextZone);
  }

  openFromCard(event: MouseEvent): void {
    const anchor = event.currentTarget as HTMLElement | null;
    if (!anchor) {
      return;
    }
    if (event.type === 'contextmenu' && (event.clientX !== 0 || event.clientY !== 0)) {
      this.openAt(event.clientX, event.clientY, anchor);
    } else {
      this.open(anchor);
    }
  }

  close(): void {
    this.rootMenu().close();
  }
}
