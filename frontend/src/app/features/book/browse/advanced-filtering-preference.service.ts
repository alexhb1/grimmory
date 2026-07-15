import {Injectable, inject, signal} from '@angular/core';

import {LocalStorageService} from '../../../shared/service/local-storage.service';

const STORAGE_KEY = 'browseAdvancedFilteringPreference';

@Injectable({providedIn: 'root'})
export class AdvancedFilteringPreferenceService {
  private readonly localStorage = inject(LocalStorageService);
  private readonly state = signal(this.localStorage.get<boolean>(STORAGE_KEY) === true);

  readonly enabled = this.state.asReadonly();

  setEnabled(value: boolean): void {
    this.state.set(value);
    this.localStorage.set(STORAGE_KEY, value);
  }
}
