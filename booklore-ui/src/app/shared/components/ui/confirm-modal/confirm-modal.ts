import { Component, input, output, viewChild } from '@angular/core';
import { ButtonComponent } from '../button/button';
import { ModalComponent } from '../modal/modal';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [ButtonComponent, ModalComponent],
  template: `
    <app-modal #modal size="sm">
      <div modal-header class="px-5 pt-5">
        <h2 class="font-heading text-lg font-bold text-ink tracking-tight">{{ title() }}</h2>
      </div>

      <p class="text-sm text-ink-light px-5 py-3 leading-relaxed">{{ message() }}</p>

      <div modal-footer class="flex items-center justify-end gap-2 px-5 pb-5">
        <app-button variant="secondary" (click)="close()">{{ cancelLabel() }}</app-button>
        <app-button [variant]="confirmVariant()" (click)="onConfirm()">{{ confirmLabel() }}</app-button>
      </div>
    </app-modal>
  `,
})
export class ConfirmModalComponent {
  title = input('Confirm');
  message = input('Are you sure?');
  confirmLabel = input('Confirm');
  cancelLabel = input('Cancel');
  confirmVariant = input<'primary' | 'danger'>('primary');
  confirmed = output<void>();

  private modal = viewChild.required<ModalComponent>('modal');

  open() {
    this.modal().open();
  }

  close() {
    this.modal().close();
  }

  onConfirm() {
    this.confirmed.emit();
    this.close();
  }
}
