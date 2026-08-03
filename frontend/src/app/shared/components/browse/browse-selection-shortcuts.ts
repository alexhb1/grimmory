import {DestroyRef, inject} from '@angular/core';

export interface BrowseSelectionShortcutsDeps {
  enabled: () => boolean;
  active: () => boolean;
  suspended?: () => boolean;
  clear: () => void;
  selectAll: () => void;
  exemptSelector: string;
  onEscapeWhileInactive?: () => void;
}

export function installBrowseSelectionShortcuts(deps: BrowseSelectionShortcutsDeps): void {
  const destroyRef = inject(DestroyRef);

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape'
      && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      if (deps.suspended?.()) {
        return;
      }
      if (deps.active()) {
        deps.clear();
        return;
      }
      deps.onEscapeWhileInactive?.();
      return;
    }

    if (event.key.toLowerCase() === 'a'
      && event.ctrlKey !== event.metaKey && !event.shiftKey && !event.altKey) {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );
      if (typing || !deps.enabled()) {
        return;
      }
      event.preventDefault();
      deps.selectAll();
    }
  };

  const onClick = (event: Event): void => {
    if (!deps.active()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest(deps.exemptSelector) === null) {
      deps.clear();
    }
  };

  document.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onClick);
  destroyRef.onDestroy(() => {
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('click', onClick);
  });
}
