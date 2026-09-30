import { afterNextRender, DestroyRef, inject } from '@angular/core';

export function enterFullscreenWhileReading(target: () => HTMLElement): void {
  let retry: ReturnType<typeof setInterval> | undefined;
  let destroyed = false;

  inject(DestroyRef).onDestroy(() => {
    destroyed = true;
    clearInterval(retry);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  });

  afterNextRender(() => {
    if (!document.fullscreenEnabled || document.fullscreenElement || !matchMedia('(pointer: coarse)').matches) {
      return;
    }
    target().requestFullscreen().catch(() => {
      if (destroyed) {
        return;
      }
      retry = setInterval(() => {
        if (navigator.userActivation?.isActive) {
          clearInterval(retry);
          void target().requestFullscreen().catch(() => undefined);
        }
      }, 250);
    });
  });
}
