import {ElementRef, Signal, computed, effect, signal} from '@angular/core';
import {injectVirtualizer} from '@tanstack/angular-virtual';
import {observeElementRect, type VirtualItem} from '@tanstack/virtual-core';

const DEFAULT_OVERSCAN_ROWS = 2;

export interface VirtualGridOptions {
  items: Signal<readonly unknown[]>;
  scrollElement: Signal<ElementRef<HTMLElement> | undefined>;
  minItemWidth: Signal<number>;
  estimateItemHeight: (itemWidth: number) => number;
  gap: number | Signal<number>;
  overscan?: number;
  count?: Signal<number>;
  columns?: Signal<number | undefined>;
  initialOffset?: () => number;
  fillItemWidth?: boolean;
}

function getScrollContentWidth(element: HTMLElement | null): number {
  if (!element) {
    return 0;
  }

  const style = getComputedStyle(element);
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(0, element.clientWidth - horizontalPadding);
}

function computeGridColumns(containerWidth: number, minColumnWidth: number, gap: number): number {
  if (containerWidth <= 0 || minColumnWidth <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap)));
}

export function scaleForGridColumns(
  viewportWidth: number,
  gap: number,
  columns: number,
  baseWidth: number,
  minScale: number,
  maxScale: number
): number {
  const targetColumns = Math.max(1, Math.round(columns));
  const targetWidth = ((viewportWidth + gap) / (targetColumns + 0.5)) - gap;
  const scale = targetWidth / baseWidth;
  return Math.min(maxScale, Math.max(minScale, scale));
}

export function createVirtualGrid(options: VirtualGridOptions) {
  const viewportWidth = signal(0);
  const gap = computed(() => typeof options.gap === 'number' ? options.gap : options.gap());

  const gridColumns = computed(() => {
    const columns = options.columns?.();
    if (columns && columns > 0) {
      return Math.floor(columns);
    }

    return computeGridColumns(viewportWidth(), options.minItemWidth(), gap());
  });
  const itemWidth = computed(() => {
    if (!options.fillItemWidth) {
      return options.minItemWidth();
    }

    const columns = gridColumns();
    const availableWidth = viewportWidth();
    if (columns <= 0 || availableWidth <= 0) {
      return options.minItemWidth();
    }

    const totalGap = (columns - 1) * gap();
    return Math.max(options.minItemWidth(), (availableWidth - totalGap) / columns);
  });
  const itemHeight = computed(() => options.estimateItemHeight(itemWidth()));
  const columnGap = computed(() => {
    if (options.fillItemWidth) {
      return gap();
    }

    const columns = gridColumns();
    if (columns <= 1) {
      return gap();
    }

    const remainingWidth = viewportWidth() - (columns * itemWidth());
    return Math.max(gap(), remainingWidth / (columns - 1));
  });

  const virtualizer = injectVirtualizer<HTMLElement, HTMLElement>(() => ({
    scrollElement: options.scrollElement(),
    count: options.count?.() ?? options.items().length,
    estimateSize: () => itemHeight(),
    overscan: options.overscan ?? gridColumns() * DEFAULT_OVERSCAN_ROWS,
    gap: columnGap(),
    lanes: gridColumns(),
    initialOffset: () => options.initialOffset?.() ?? 0,
    observeElementRect: (instance, callback) => observeElementRect(instance, rect => {
      callback(rect);
      viewportWidth.set(Math.round(getScrollContentWidth(instance.scrollElement)));
    }),
  }));

  // Reset measured sizes when geometry changes; otherwise density toggles flash.
  effect(() => {
    itemHeight();
    gridColumns();
    columnGap();
    queueMicrotask(() => virtualizer.measure());
  });

  const updatePreservingScrollPosition = (update: () => void): void => {
    const scrollElement = options.scrollElement()?.nativeElement;
    if (!scrollElement) {
      update();
      return;
    }

    const scrollTop = scrollElement.scrollTop;
    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    const scrollRatio = maxScrollTop > 0 ? scrollTop / maxScrollTop : 0;

    update();

    const restoreScrollPosition = (): void => {
      virtualizer.measure();
      const nextMaxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
      virtualizer.scrollToOffset(nextMaxScrollTop * scrollRatio);
    };

    queueMicrotask(() => {
      requestAnimationFrame(() => {
        restoreScrollPosition();
        requestAnimationFrame(restoreScrollPosition);
      });
    });
  };

  return {
    viewportWidth,
    gridColumns,
    itemWidth,
    itemHeight,
    itemTransform: (item: VirtualItem) =>
      `translateX(${item.lane * (itemWidth() + columnGap())}px) translateY(${item.start}px)`,
    updatePreservingScrollPosition,
    virtualizer,
  };
}
