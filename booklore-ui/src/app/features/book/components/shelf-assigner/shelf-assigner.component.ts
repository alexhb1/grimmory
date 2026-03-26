import {Component, computed, effect, inject} from '@angular/core';
import {Book} from '../../model/book.model';
import {MessageService} from 'primeng/api';
import {ShelfService} from '../../service/shelf.service';
import {finalize} from 'rxjs';
import {BookService} from '../../service/book.service';
import {Shelf} from '../../model/shelf.model';
import {FormsModule} from '@angular/forms';
import {LoadingService} from '../../../../core/services/loading.service';
import {UserService} from '../../../settings/user-management/user.service';
import {IconDisplayComponent} from '../../../../shared/components/icon-display/icon-display.component';
import {IconSelection} from '../../../../shared/service/icon-picker.service';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {ModalRef, ModalService} from '../../../../shared/components/ui/modal/modal.service';
import {ShelfCreatorComponent} from '../shelf-creator/shelf-creator.component';
import {MODAL_DATA} from '../../../../shared/components/ui/modal/modal-host';
import {ButtonComponent} from '../../../../shared/components/ui/button/button';
import {CheckboxComponent} from '../../../../shared/components/ui/checkbox/checkbox';
import {InputDirective} from '../../../../shared/components/ui/input/input';

@Component({
  selector: 'app-shelf-assigner',
  standalone: true,
  templateUrl: './shelf-assigner.component.html',
  host: {class: 'flex flex-col flex-1 min-h-0'},
  imports: [
    ButtonComponent,
    CheckboxComponent,
    FormsModule,
    IconDisplayComponent,
    TranslocoDirective,
    InputDirective
  ]
})
export class ShelfAssignerComponent {

  private shelfService = inject(ShelfService);
  private data = inject(MODAL_DATA) as { book: Book; bookIds: Set<number>; isMultiBooks: boolean } | null;
  readonly modalRef = inject(ModalRef);
  private modalService = inject(ModalService);
  private messageService = inject(MessageService);
  private bookService = inject(BookService);
  private loadingService = inject(LoadingService);
  private userService = inject(UserService);
  private readonly t = inject(TranslocoService);

  searchQuery = '';
  private currentUser = this.userService.currentUser;

  book: Book = this.data!.book;
  selectedShelves: Shelf[] = [];
  bookIds: Set<number> = this.data!.bookIds;
  isMultiBooks: boolean = this.data!.isMultiBooks;
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
  private readonly initializeSelectedShelvesEffect = effect(() => {
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

  updateBooksShelves(): void {
    const idsToAssign = new Set<number | undefined>(this.selectedShelves.map(shelf => shelf.id));
    const idsToUnassign: Set<number> = this.isMultiBooks ? new Set() : this.getIdsToUnAssign(this.book, idsToAssign);
    const bookIds = this.isMultiBooks ? this.bookIds : new Set([this.book.id]);
    this.updateBookShelves(bookIds, idsToAssign, idsToUnassign);
  }

  private updateBookShelves(bookIds: Set<number>, idsToAssign: Set<number | undefined>, idsToUnassign: Set<number>): void {
    const loader = this.loadingService.show(this.t.translate('book.shelfAssigner.loading.updatingShelves', { count: bookIds.size }));

    this.bookService.updateBookShelves(bookIds, idsToAssign, idsToUnassign)
      .pipe(finalize(() => this.loadingService.hide(loader)))
      .subscribe({
        next: () => {
          this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfAssigner.toast.updateSuccessDetail')});
          this.modalRef.close({assigned: true});
        },
        error: () => {
          this.messageService.add({severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('book.shelfAssigner.toast.updateFailedDetail')});
          this.modalRef.close({assigned: false});
        }
      });
  }

  private getIdsToUnAssign(book: Book, idsToAssign: Set<number | undefined>): Set<number> {
    const idsToUnassign = new Set<number>();
    book.shelves?.forEach(shelf => {
      if (!idsToAssign.has(shelf.id)) {
        idsToUnassign.add(shelf.id!);
      }
    });
    return idsToUnassign;
  }

  createShelfDialog(): void {
    this.modalService.open(ShelfCreatorComponent, {title: 'New Shelf', size: 'sm'});
  }

  isShelfSelected(shelf: Shelf): boolean {
    return this.selectedShelves.some(s => s.id === shelf.id);
  }

  toggleShelf(shelf: Shelf, checked: boolean): void {
    if (checked) {
      if (!this.isShelfSelected(shelf)) {
        this.selectedShelves = [...this.selectedShelves, shelf];
      }
    } else {
      this.selectedShelves = this.selectedShelves.filter(s => s.id !== shelf.id);
    }
  }

  getShelfIcon(shelf: Shelf): IconSelection {
    if (shelf.iconType === 'CUSTOM_SVG') {
      return {type: 'CUSTOM_SVG', value: shelf.icon ?? ""};
    } else {
      return {type: 'PRIME_NG', value: `pi pi-${shelf.icon}`};
    }
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
      const aVal = (a as unknown as Record<string, unknown>)[sortField] ?? '';
      const bVal = (b as unknown as Record<string, unknown>)[sortField] ?? '';
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      }
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
