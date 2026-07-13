import { DestroyRef, inject, signal, type Signal } from '@angular/core';

const MOBILE_SHELL_MEDIA_QUERY =
  '(width <= 599px), ((width <= 959px) and (height <= 500px) and (pointer: coarse) and (hover: none))';

export function injectMediaQuery(query: string): Signal<boolean> {
  const destroyRef = inject(DestroyRef);
  if (typeof globalThis.matchMedia !== 'function') {
    return signal(false).asReadonly();
  }
  const media = globalThis.matchMedia(query);
  const matches = signal(media.matches);
  const onChange = (event: MediaQueryListEvent) => matches.set(event.matches);
  media.addEventListener('change', onChange);
  destroyRef.onDestroy(() => media.removeEventListener('change', onChange));
  return matches.asReadonly();
}

export function injectMobileShell(): Signal<boolean> {
  return injectMediaQuery(MOBILE_SHELL_MEDIA_QUERY);
}
