import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {ModalService} from '../components/ui/modal/modal.service';
import {IconPickerComponent} from '../components/icon-picker/icon-picker-component';

export interface IconSelection {
  type: 'PRIME_NG' | 'CUSTOM_SVG';
  value: string;
}

@Injectable({providedIn: 'root'})
export class IconPickerService {
  private modalService = inject(ModalService);

  open(): Observable<IconSelection> {
    const ref = this.modalService.open<void, IconSelection>(IconPickerComponent, {
      title: 'Choose an Icon',
      size: 'lg',
      height: '80vh',
    });
    return ref.onClose as Observable<IconSelection>;
  }
}
