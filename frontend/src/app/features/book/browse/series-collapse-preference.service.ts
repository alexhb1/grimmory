import {Injectable, inject, signal} from '@angular/core';

import {LocalStorageService} from '../../../shared/service/local-storage.service';

const STORAGE_KEY = 'browseSeriesCollapsePreference';

@Injectable({providedIn: 'root'})
export class SeriesCollapsePreferenceService {
  private readonly localStorage = inject(LocalStorageService);
  private readonly state = signal(this.localStorage.get<boolean>(STORAGE_KEY) === true);

  readonly seriesCollapsed = this.state.asReadonly();

  setSeriesCollapsed(value: boolean): void {
    this.state.set(value);
    this.localStorage.set(STORAGE_KEY, value);
  }
}
