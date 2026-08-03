import {computed, effect, linkedSignal, signal, untracked, type Signal} from '@angular/core';

import {findBrowsePageLink, flattenBrowsePages, type BrowsePage} from '../../../core/data/browse.models';
import {type BrowseGridStatus} from './browse-grid/browse-grid.component';
import {type BrowseGridRenderedRange} from './browse-grid/browse-grid-viewport.component';

const DEFAULT_PREFETCH_THRESHOLD = 12;
const DEFAULT_ARTWORK_HOLD_MS = 400;
const DEFAULT_COLLECTION_HOLD_MS = 600;

interface BrowsePageData<T> {
  pages: BrowsePage<T>[];
}

export interface BrowsePresentationQuery<T extends {id: number}> {
  data: () => BrowsePageData<T> | undefined;
  isPlaceholderData: () => boolean;
  isSuccess: () => boolean;
  isError: () => boolean;
  isFetchNextPageError: () => boolean;
  hasNextPage: () => boolean;
  isFetching: () => boolean;
  fetchNextPage: (options?: {cancelRefetch?: boolean}) => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

export interface BrowsePresentationDeps<T extends {id: number}> {
  query: BrowsePresentationQuery<T>;
  orderingIdentity: Signal<string>;
  artworkUrls: (items: readonly T[], lastVisibleIndex: number) => readonly string[];
  scrollToTop: () => void;
  prefetchThreshold?: number;
  artworkHoldMs?: number;
  collectionHoldMs?: number;
}

export interface BrowsePresentation<T extends {id: number}> {
  readonly items: Signal<readonly T[]>;
  readonly total: Signal<number | null>;
  readonly status: Signal<BrowseGridStatus>;
  readonly nextPageError: Signal<boolean>;
  readonly hasNextPage: Signal<boolean>;
  readonly holding: Signal<boolean>;
  onRenderedRange(range: BrowseGridRenderedRange): void;
  retryInitial(): void;
  retryNextPage(): void;
}

export function heldSignal<S>(value: () => S, holding: () => boolean): Signal<S> {
  return linkedSignal<{stale: boolean; value: S}, S>({
    source: () => ({stale: holding(), value: value()}),
    computation: (source, previous) => (source.stale && previous ? previous.value : source.value),
  });
}

function preloadImage(url: string): Promise<void> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
    if (image.complete) {
      resolve();
    }
  });
}

export function createBrowsePresentation<T extends {id: number}>(
  deps: BrowsePresentationDeps<T>,
): BrowsePresentation<T> {
  const prefetchThreshold = deps.prefetchThreshold ?? DEFAULT_PREFETCH_THRESHOLD;
  const artworkHoldMs = deps.artworkHoldMs ?? DEFAULT_ARTWORK_HOLD_MS;
  const collectionHoldMs = deps.collectionHoldMs ?? DEFAULT_COLLECTION_HOLD_MS;

  const lastVisibleEnd = signal(0);
  const presentedData = signal<BrowsePageData<T> | undefined>(undefined);
  let presentedIdentity: string | null = null;
  let presentToken = 0;

  const holding = computed(() =>
    presentedData() !== undefined
      && (deps.query.isPlaceholderData() || presentedData() !== deps.query.data()));

  const items = computed<readonly T[]>(() => flattenBrowsePages(presentedData()));
  const total = computed<number | null>(() =>
    presentedData()?.pages[0]?.page.totalElements ?? null,
  );
  const status = computed<BrowseGridStatus>(() => {
    if (items().length > 0
      || (presentedData() !== undefined && deps.query.isSuccess())) {
      return 'success';
    }
    return deps.query.isError() ? 'error' : 'pending';
  });
  const nextPageError = computed(() =>
    items().length > 0 && deps.query.isFetchNextPageError(),
  );
  const hasNextPage = computed(() => {
    const lastPage = presentedData()?.pages.at(-1);
    return lastPage !== undefined && findBrowsePageLink(lastPage, 'next') !== undefined;
  });

  function presentCollection(identity: string, data: BrowsePageData<T> | undefined): void {
    const token = ++presentToken;
    const publish = (): void => {
      if (token === presentToken && data) {
        if (presentedIdentity !== null && presentedIdentity !== identity) {
          deps.scrollToTop();
        }
        presentedIdentity = identity;
        presentedData.set(data);
      }
    };

    if (presentedIdentity === null
      || presentedIdentity === identity
      || presentedData() === undefined) {
      publish();
      return;
    }

    if (!data) {
      setTimeout(() => {
        if (token === presentToken) {
          presentedData.set(undefined);
        }
      }, collectionHoldMs);
      return;
    }

    const urls = deps.artworkUrls(flattenBrowsePages(data), lastVisibleEnd());
    if (urls.length === 0) {
      publish();
      return;
    }
    const timer = setTimeout(publish, artworkHoldMs);
    void Promise.all(urls.map(preloadImage)).then(() => {
      clearTimeout(timer);
      publish();
    });
  }

  effect(() => {
    const identity = deps.orderingIdentity();
    const data = deps.query.data();
    const ready = data !== undefined && !deps.query.isPlaceholderData();
    untracked(() => presentCollection(identity, ready ? data : undefined));
  });

  function onRenderedRange(range: BrowseGridRenderedRange): void {
    lastVisibleEnd.set(range.end);
    if (
      range.end >= items().length - prefetchThreshold &&
      deps.query.hasNextPage() &&
      !deps.query.isFetching()
    ) {
      void deps.query.fetchNextPage({cancelRefetch: false});
    }
  }

  return {
    items,
    total,
    status,
    nextPageError,
    hasNextPage,
    holding,
    onRenderedRange,
    retryInitial: () => {
      void deps.query.refetch();
    },
    retryNextPage: () => {
      void deps.query.fetchNextPage();
    },
  };
}
