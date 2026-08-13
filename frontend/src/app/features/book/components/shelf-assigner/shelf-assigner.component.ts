import {Component, computed, effect, inject} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {Book} from '../../model/book.model';
import {MessageService} from '@openng/optimus-ui/api';
import {ShelfService} from '../../service/shelf.service';
import {finalize} from 'rxjs';
import {BookService} from '../../service/book.service';
import {Shelf} from '../../model/shelf.model';
import {Button} from '@openng/optimus-ui/button';
import {Checkbox} from '@openng/optimus-ui/checkbox';
import {FormsModule} from '@angular/forms';
import {BookDialogHelperService} from '../book-browser/book-dialog-helper.service';
import {LoadingService} from '../../../../core/services/loading.service';
import {UserService} from '../../../settings/user-management/user.service';
import {IconDisplayComponent} from '../../../../shared/components/icon-display/icon-display.component';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {InputText} from '@openng/optimus-ui/inputtext';
import {IconField} from '@openng/optimus-ui/iconfield';
import {InputIcon} from '@openng/optimus-ui/inputicon';
import {IconSelection, toIconSelection} from '../../../../shared/icons/icon-selection';

export type ShelfAssignerDialogData =
  | {isMultiBooks: false; book: Book}
  | {isMultiBooks: true; bookIds: Set<number>};

@Component({
  selector: 'app-shelf-assigner',
  standalone: true,
  templateUrl: './shelf-assigner.component.html',
  styleUrl: './shelf-assigner.component.scss',
  imports: [
    Button,
    Checkbox,
    FormsModule,
    IconDisplayComponent,
    TranslocoDirective,
    InputText,
    IconField,
    InputIcon
  ]
})
export class ShelfAssignerComponent {

  private shelfService = inject(ShelfService);
  private dynamicDialogConfig = inject<DynamicDialogConfig<ShelfAssignerDialogData>>(DynamicDialogConfig);
  private dynamicDialogRef = inject(DynamicDialogRef);
  private messageService = inject(MessageService);
  private bookService = inject(BookService);
  private bookDialogHelper = inject(BookDialogHelperService);
  private loadingService = inject(LoadingService);
  private userService = inject(UserService);
  private readonly t = inject(TranslocoService);

  searchQuery = '';
  private currentUser = this.userService.currentUser;

  book!: Book;
  selectedShelves: Shelf[] = [];
  bookIds!: Set<number>;
  isMultiBooks!: boolean;
  private readonly shelfSortField = computed<'name' | 'id'>(() => {
    const sorting = this.currentUser()?.userSettings.sidebarShelfSorting;
    return sorting ? this.validateSortField(sorting.field) : 'name';
  });
  private readonly shelfSortOrder = computed<'asc' | 'desc'>(() => {
    const sorting = this.currentUser()?.userSettings.sidebarShelfSorting;
    return sorting ? this.validateSortOrder(sorting.order) : 'asc';
  });
  readonly shelves = computed(() => {
    const user = this.currentUser();
    const filteredShelves = this.shelfService.shelves().filter(shelf => shelf.userId === user?.id);
    return this.sortShelves(filteredShelves);
  });
  private hasInitializedSelectedShelves = false;

  constructor() {
    const data = this.dynamicDialogConfig.data;
    if (!data) {
      throw new Error('Shelf assigner dialog requires book data.');
    }
    this.isMultiBooks = data.isMultiBooks;
    if (data.isMultiBooks) {
      this.bookIds = data.bookIds;
    } else {
      this.book = data.book;
    }

    effect(() => {
      if (this.isMultiBooks || this.hasInitializedSelectedShelves || !this.book.shelves?.length) {
        return;
      }

      const selectedShelves = this.shelves().filter(shelf =>
        this.book.shelves?.some(bookShelf => bookShelf.id === shelf.id)
      );

      if (selectedShelves.length > 0 || this.shelfService.shelves().length > 0) {
        this.selectedShelves = selectedShelves;
        this.hasInitializedSelectedShelves = true;
      }
    });
  }

  updateBooksShelves(): void {
    const idsToAssign = new Set(this.selectedShelves.flatMap(shelf => shelf.id === undefined ? [] : [shelf.id]));
    if (this.isMultiBooks) {
      this.updateBookShelves(this.bookIds, idsToAssign, new Set<number>());
      return;
    }

    this.updateBookShelves(new Set([this.book.id]), idsToAssign, this.getIdsToUnAssign(this.book, idsToAssign));
  }

  private updateBookShelves(bookIds: Set<number>, idsToAssign: Set<number>, idsToUnassign: Set<number>): void {
    const loader = this.loadingService.show(this.t.translate('book.shelfAssigner.loading.updatingShelves', { count: bookIds.size }));

    this.bookService.updateBookShelves(bookIds, idsToAssign, idsToUnassign)
      .pipe(finalize(() => this.loadingService.hide(loader)))
      .subscribe({
        next: () => {
          this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfAssigner.toast.updateSuccessDetail')});
          this.dynamicDialogRef.close({assigned: true});
        },
        error: () => {
          this.messageService.add({severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('book.shelfAssigner.toast.updateFailedDetail')});
          this.dynamicDialogRef.close({assigned: false});
        }
      });
  }

  private getIdsToUnAssign(book: Book, idsToAssign: Set<number>): Set<number> {
    const idsToUnassign = new Set<number>();
    book.shelves?.forEach(shelf => {
      if (shelf.id !== undefined && !idsToAssign.has(shelf.id)) {
        idsToUnassign.add(shelf.id);
      }
    });
    return idsToUnassign;
  }

  createShelfDialog(): void {
    void this.bookDialogHelper.openShelfCreatorDialog();
  }

  closeDialog(): void {
    this.dynamicDialogRef.close({assigned: false});
  }

  isShelfSelected(shelf: Shelf): boolean {
    return this.selectedShelves.some(s => s.id === shelf.id);
  }

  getShelfIcon(shelf: Shelf): IconSelection | null {
    return shelf.icon ? toIconSelection(shelf.icon, shelf.iconType) : null;
  }

  filterShelves(shelves: Shelf[]): Shelf[] {
    if (!this.searchQuery.trim()) {
      return shelves;
    }
    const query = this.searchQuery.trim().toLowerCase();
    return shelves.filter(s => s.name.toLowerCase().includes(query));
  }

  private sortShelves(shelves: Shelf[]): Shelf[] {
    const sortField = this.shelfSortField();
    const sortOrder = this.shelfSortOrder();
    return [...shelves].sort((a, b) => {
      const comparison = sortField === 'name'
        ? a.name.localeCompare(b.name)
        : a.id !== undefined && b.id !== undefined ? a.id - b.id : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  private validateSortField(field: string): 'name' | 'id' {
    return field === 'id' ? 'id' : 'name';
  }

  private validateSortOrder(order: string): 'asc' | 'desc' {
    return order === 'desc' ? 'desc' : 'asc';
  }
}
