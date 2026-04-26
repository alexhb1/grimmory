import {computed, inject, Injectable, signal} from '@angular/core';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';

@Injectable({
  providedIn: 'root'
})
export class CoverScalePreferenceService {

  private readonly BASE_WIDTH = 135;
  private readonly BASE_HEIGHT = 220;
  private readonly STORAGE_KEY = 'coverScalePreference';
  private readonly MIN_SCALE = 0.5;
  private readonly MAX_SCALE = 1.5;

  private readonly localStorageService = inject(LocalStorageService);

  private readonly _scaleFactor = signal(1.0);
  readonly scaleFactor = this._scaleFactor.asReadonly();

  readonly currentCardSize = computed(() => ({
    width: Math.round(this.BASE_WIDTH * this.scaleFactor()),
    height: Math.round(this.BASE_HEIGHT * this.scaleFactor()),
  }));

  private lastPersistedScale = 1.0;

  constructor() {
    const initialScale = this.loadScaleFromStorage();
    this._scaleFactor.set(initialScale);
    this.lastPersistedScale = initialScale;
  }

  setScale(scale: number): void {
    const normalizedScale = this.clampScale(scale);
    this._scaleFactor.set(normalizedScale);
    if (normalizedScale === this.lastPersistedScale) {
      return;
    }
    this.saveScalePreference(normalizedScale);
  }

  private saveScalePreference(scale: number): void {
    this.localStorageService.set(this.STORAGE_KEY, scale);
    this.lastPersistedScale = scale;
  }

  private loadScaleFromStorage(): number {
    const saved = this.localStorageService.get<number>(this.STORAGE_KEY);
    if (saved !== null && !isNaN(saved)) {
      return this.clampScale(saved);
    }
    return 1.0;
  }

  private clampScale(scale: number): number {
    return Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, scale));
  }
}
