import { inject, Injectable } from '@angular/core';
import { ModalService, ModalRef } from '../modal/modal.service';
import { ConfirmModalDialogComponent } from './confirm-modal-dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private modalService = inject(ModalService);

  /**
   * Open a confirmation dialog. Returns an Observable that emits `true` if confirmed, `false` if cancelled.
   *
   * Usage:
   * ```
   * this.confirm.open({ message: 'Delete this?', confirmVariant: 'danger' }).subscribe(confirmed => {
   *   if (confirmed) { ... }
   * });
   * ```
   */
  open(options: ConfirmOptions): Observable<boolean> {
    const ref = this.modalService.open<ConfirmOptions, boolean>(ConfirmModalDialogComponent, {
      title: options.title ?? 'Confirm',
      size: 'sm',
      data: options,
    });

    return ref.onClose.pipe(map(result => result === true));
  }
}
