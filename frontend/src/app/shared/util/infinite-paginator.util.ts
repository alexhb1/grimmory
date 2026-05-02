import {EffectRef, effect} from '@angular/core';

interface InfinitePaginatorOptions<TItem extends {id: number | string}> {
  items: () => readonly TItem[];
  hasNextPage: () => boolean;
  isFetchingNextPage: () => boolean;
  virtualizer: {getVirtualItems: () => readonly {index: number}[]};
  loadNextPage: () => void;
  loadAheadRows?: number;
  enabled?: () => boolean;
}

/**
 * Creates an infinite pagination effect inside Angular's injection context.
 *
 * Because this calls effect(), call it from a field initializer, constructor,
 * or runInInjectionContext(); lifecycle hooks such as ngOnInit will throw
 * NG0203 unless wrapped in runInInjectionContext().
 */
export function createInfinitePaginator<TItem extends {id: number | string}>(options: InfinitePaginatorOptions<TItem>): EffectRef {
  let lastLoadRequestCount = 0;
  let previousIdsToken: string | undefined;

  return effect(() => {
    if (options.enabled?.() === false) return;

    const items = options.items();
    const idsToken = items.map(item => item.id).join('|');
    if (previousIdsToken !== undefined && idsToken !== previousIdsToken) {
      lastLoadRequestCount = 0;
    }
    previousIdsToken = idsToken;

    const loadedCount = items.length;
    const lastItem = options.virtualizer.getVirtualItems().at(-1);
    if (!lastItem || loadedCount === 0) return;
    if (lastItem.index < loadedCount - (options.loadAheadRows ?? 1)) return;
    if (!options.hasNextPage() || options.isFetchingNextPage()) return;
    if (lastLoadRequestCount === loadedCount) return;

    lastLoadRequestCount = loadedCount;
    options.loadNextPage();
  });
}
