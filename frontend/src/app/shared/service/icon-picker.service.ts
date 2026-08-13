import {inject, Injectable} from '@angular/core';
import {EMPTY, filter, from, Observable, switchMap} from 'rxjs';
import {DialogLauncherService} from '../services/dialog-launcher.service';
import {IconSelection} from '../icons/icon-selection';

@Injectable({providedIn: 'root'})
export class IconPickerService {
  private dialogLauncherService = inject(DialogLauncherService);

  open(): Observable<IconSelection> {
    return from(this.dialogLauncherService.openIconPickerDialog()).pipe(
      switchMap(ref => {
        if (!ref) {
          return EMPTY;
        }
        return ref.onClose.pipe(filter(isIconSelection));
      })
    );
  }
}

function isIconSelection(value: unknown): value is IconSelection {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return 'type' in value
    && (value.type === 'LUCIDE' || value.type === 'CUSTOM_SVG')
    && 'value' in value
    && typeof value.value === 'string';
}
