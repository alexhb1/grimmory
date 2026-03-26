import { Component, inject } from '@angular/core';
import { ModalRef } from '../modal/modal.service';
import { MODAL_DATA } from '../modal/modal-host';
import { ButtonComponent } from '../button/button';
import { ConfirmOptions } from './confirm.service';

@Component({
  selector: 'app-confirm-modal-dialog',
  standalone: true,
  imports: [ButtonComponent],
  host: { class: 'flex flex-col flex-1 min-h-0' },
  template: `
    <p class="text-sm text-ink-light leading-relaxed px-6 pt-1 pb-5">{{ data.message }}</p>
    <div class="flex items-center justify-end gap-2 px-6 pb-5">
      <app-button variant="secondary" (click)="modalRef.close(false)">{{ data.cancelLabel ?? 'Cancel' }}</app-button>
      <app-button [variant]="data.confirmVariant ?? 'primary'" (click)="modalRef.close(true)">{{ data.confirmLabel ?? 'Confirm' }}</app-button>
    </div>
  `,
})
export class ConfirmModalDialogComponent {
  readonly modalRef = inject(ModalRef);
  readonly data = inject(MODAL_DATA) as ConfirmOptions;
}
