import {Injectable, OnDestroy} from '@angular/core';

@Injectable({providedIn: 'root'})
export class WakeLockService implements OnDestroy {
  private wakeLock: WakeLockSentinel | null = null;
  private enabled = false;
  private requestGeneration = 0;

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.requestWakeLock();
  }

  disable(): void {
    this.enabled = false;
    this.requestGeneration++;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.releaseWakeLock(this.wakeLock);
  }

  ngOnDestroy(): void {
    this.disable();
  }

  private requestWakeLock(): void {
    if (!this.enabled || !('wakeLock' in navigator)) return;
    if (this.wakeLock && !this.wakeLock.released) return;

    const requestGeneration = ++this.requestGeneration;
    navigator.wakeLock.request('screen')
      .then(wakeLock => {
        if (!this.enabled || requestGeneration !== this.requestGeneration) {
          this.releaseWakeLock(wakeLock);
          return;
        }

        this.wakeLock = wakeLock;
        wakeLock.addEventListener('release', () => {
          if (this.wakeLock === wakeLock) {
            this.wakeLock = null;
          }
        }, {once: true});
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          // Denial is expected when the page is hidden or the device cannot grant a lock.
          return;
        }
        console.warn('Failed to acquire screen wake lock:', error);
      });
  }

  private releaseWakeLock(wakeLock: WakeLockSentinel | null): void {
    if (!wakeLock) return;

    if (this.wakeLock === wakeLock) {
      this.wakeLock = null;
    }

    if (wakeLock.released) return;
    wakeLock.release().catch((error: unknown) => {
      console.warn('Failed to release screen wake lock:', error);
    });
  }

  private onVisibilityChange = (): void => {
    if (this.enabled && document.visibilityState === 'visible') {
      this.requestWakeLock();
    }
  };
}
