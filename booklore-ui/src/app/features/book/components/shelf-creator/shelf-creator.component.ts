import {Component, inject} from '@angular/core';
import {MessageService} from 'primeng/api';
import {ShelfService} from '../../service/shelf.service';
import {IconPickerService, IconSelection} from '../../../../shared/service/icon-picker.service';
import {Shelf} from '../../model/shelf.model';
import {FormsModule} from '@angular/forms';
import {Tooltip} from 'primeng/tooltip';
import {IconDisplayComponent} from '../../../../shared/components/icon-display/icon-display.component';
import {UserService} from '../../../settings/user-management/user.service';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {ModalRef} from '../../../../shared/components/ui/modal/modal.service';
import {ButtonComponent} from '../../../../shared/components/ui/button/button';
import {InputDirective} from '../../../../shared/components/ui/input/input';
import {ToggleComponent} from '../../../../shared/components/ui/toggle/toggle';
import {DividerComponent} from '../../../../shared/components/ui/divider/divider';

@Component({
  selector: 'app-shelf-creator',
  standalone: true,
  templateUrl: './shelf-creator.component.html',
  imports: [
    FormsModule,
    ButtonComponent,
    InputDirective,
    Tooltip,
    IconDisplayComponent,
    ToggleComponent,
    DividerComponent,
    TranslocoDirective
  ],
  host: {class: 'flex flex-col flex-1 min-h-0'},
})
export class ShelfCreatorComponent {
  private shelfService = inject(ShelfService);
  readonly modalRef = inject(ModalRef);
  private messageService = inject(MessageService);
  private iconPickerService = inject(IconPickerService);
  private userService = inject(UserService);
  private readonly t = inject(TranslocoService);

  shelfName: string = '';
  selectedIcon: IconSelection | null = null;
  isPublic: boolean = false;
  isAdmin: boolean = this.userService.getCurrentUser()?.permissions.admin ?? false;

  openIconPicker(): void {
    this.iconPickerService.open().subscribe(icon => {
      if (icon) {
        this.selectedIcon = icon;
      }
    });
  }

  clearSelectedIcon(): void {
    this.selectedIcon = null;
  }

  cancel(): void {
    this.modalRef.close();
  }

  createShelf(): void {
    const iconValue = this.selectedIcon?.value ?? null;
    const iconType = this.selectedIcon?.type ?? null;

    const newShelf: Partial<Shelf> = {
      name: this.shelfName,
      icon: iconValue,
      iconType: iconType,
      publicShelf: this.isPublic
    };

    this.shelfService.createShelf(newShelf as Shelf).subscribe({
      next: () => {
        this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfCreator.toast.createSuccessDetail', { name: this.shelfName })});
        this.modalRef.close(true);
      },
      error: (e) => {
        this.messageService.add({severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('book.shelfCreator.toast.createFailedDetail')});
        console.error('Error creating shelf:', e);
      }
    });
  }
}
