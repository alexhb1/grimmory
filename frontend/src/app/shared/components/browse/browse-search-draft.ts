import {computed, effect, signal, untracked, type Signal} from '@angular/core';

import {debouncedSignal} from '../../util/debounced-signal';
import {SEARCH_DEBOUNCE_MS} from '../../util/search-terms';

export interface BrowseSearchDraftDeps {
  committed: Signal<string>;
  commit: (term: string) => void;
  initial?: string;
  debounceMs?: number;
}

export interface BrowseSearchDraft {
  readonly value: Signal<string>;
  set(value: string): void;
}

export function createBrowseSearchDraft(deps: BrowseSearchDraftDeps): BrowseSearchDraft {
  const draft = signal(deps.initial ?? deps.committed());
  const debounced = debouncedSignal(
    computed(() => draft().trim()), deps.debounceMs ?? SEARCH_DEBOUNCE_MS,
  );

  effect(() => {
    const committed = deps.committed();
    untracked(() => {
      if (debounced() === draft().trim() && draft().trim() !== committed) {
        draft.set(committed);
      }
    });
  });

  effect(() => {
    const settled = debounced();
    untracked(() => {
      if (settled !== draft().trim() || settled === deps.committed()) {
        return;
      }
      deps.commit(settled);
    });
  });

  return {
    value: draft.asReadonly(),
    set: value => draft.set(value),
  };
}
