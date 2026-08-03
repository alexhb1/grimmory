import {NgTemplateOutlet} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  contentChild,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {type VirtualItem} from '@tanstack/angular-virtual';

import {LayoutService} from '../../../layout/layout.service';
import {AppButtonComponent} from '../../../ui/button/app-button.component';
import {
  BrowseGridViewportComponent,
  type BrowseGridDensityFacade,
  type BrowseGridVisibleRange,
} from './browse-grid-viewport.component';
import {BrowseGridEmptyDef, BrowseGridItemDef, BrowseGridSkeletonDef} from './browse-grid.directives';
import {SKELETON_DELAY_MS} from './browse-grid.util';

export type BrowseGridStatus = 'pending' | 'error' | 'success';
type BrowseGridViewState = 'idle' | 'skeleton' | 'empty' | 'initial-error' | 'grid';

@Component({
  selector: 'app-browse-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, NgTemplateOutlet, TranslocoPipe, BrowseGridViewportComponent],
  host: {class: 'block min-w-0'},
  template: `
    @if (viewState() === 'empty') {
      <ng-container [ngTemplateOutlet]="emptyDef().templateRef" />
    } @else if (viewState() === 'initial-error') {
      <div class="flex flex-col items-center gap-3 py-16 text-center">
        <p class="m-0 text-sm text-text-muted">{{ 'browse.book.loadError' | transloco }}</p>
        <app-button
          variant="soft"
          size="sm"
          [label]="'common.retry' | transloco"
          (clicked)="retryInitial.emit()" />
      </div>
    } @else if (viewState() === 'grid' || viewState() === 'skeleton') {
      @if (isDesktop()) {
        <app-browse-grid-viewport
          scrollMode="element"
          [items]="items()"
          [itemKey]="viewportItemKey"
          [hasNextPage]="hasNextPage()"
          [fixedColumns]="fixedColumns()"
          [minItemWidth]="minItemWidth()"
          [gap]="gap()"
          [rowGap]="rowGap()"
          [estimateItemHeight]="estimateItemHeight()"
          [itemTemplate]="itemDef().templateRef"
          [skeletonTemplate]="skeletonDef().templateRef"
          [skeletonFill]="viewState() === 'skeleton'"
          (visibleRange)="visibleRange.emit($event)" />
      } @else {
        <app-browse-grid-viewport
          scrollMode="window"
          [items]="items()"
          [itemKey]="viewportItemKey"
          [hasNextPage]="hasNextPage()"
          [fixedColumns]="fixedColumns()"
          [minItemWidth]="minItemWidth()"
          [gap]="gap()"
          [rowGap]="rowGap()"
          [estimateItemHeight]="estimateItemHeight()"
          [itemTemplate]="itemDef().templateRef"
          [skeletonTemplate]="skeletonDef().templateRef"
          [skeletonFill]="viewState() === 'skeleton'"
          (visibleRange)="visibleRange.emit($event)" />
      }

      @if (viewState() === 'grid' && nextPageError()) {
        <div class="sticky bottom-4 z-10 mt-4 flex justify-center">
          <div class="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 shadow-pop">
            <span class="text-sm text-text-muted">{{ 'browse.grid.pageError' | transloco }}</span>
            <app-button
              variant="ghost"
              size="sm"
              [label]="'common.retry' | transloco"
              (clicked)="retryNextPage.emit()" />
          </div>
        </div>
      }
    }
  `,
})
export class BrowseGridComponent<T> {
  private readonly layout = inject(LayoutService);

  readonly items = input.required<readonly T[]>();
  readonly itemKey = input.required<(item: T) => VirtualItem['key']>();
  readonly hasNextPage = input.required<boolean, unknown>({transform: booleanAttribute});
  readonly status = input.required<BrowseGridStatus>();
  readonly nextPageError = input.required<boolean, unknown>({transform: booleanAttribute});
  readonly fixedColumns = input.required<number | undefined>();
  readonly minItemWidth = input.required<number>();
  readonly gap = input.required<number>();
  readonly rowGap = input.required<number | undefined>();
  readonly estimateItemHeight = input.required<(itemWidth: number) => number>();

  readonly visibleRange = output<BrowseGridVisibleRange>();
  readonly retryInitial = output<void>();
  readonly retryNextPage = output<void>();

  readonly itemDef = contentChild.required(BrowseGridItemDef);
  readonly skeletonDef = contentChild.required(BrowseGridSkeletonDef);
  readonly emptyDef = contentChild.required(BrowseGridEmptyDef);

  private readonly viewport = viewChild(BrowseGridViewportComponent);

  densityFacade(): BrowseGridDensityFacade | null {
    return this.viewport()?.densityFacade() ?? null;
  }

  scrollToTop(): void {
    this.viewport()?.scrollToTop();
  }

  protected readonly isDesktop = computed(() => this.layout.isDesktop());
  protected readonly viewportItemKey = (item: unknown): VirtualItem['key'] => this.itemKey()(item as T);
  private readonly hasLoadedItems = computed(() => this.items().length > 0);
  private readonly skeletonDelayElapsed = signal(false);

  protected readonly viewState = computed<BrowseGridViewState>(() => {
    if (this.hasLoadedItems()) {
      return 'grid';
    }
    switch (this.status()) {
      case 'error':
        return 'initial-error';
      case 'success':
        return 'empty';
      default:
        return this.skeletonDelayElapsed() ? 'skeleton' : 'idle';
    }
  });

  constructor() {
    let hadItems = false;
    effect(onCleanup => {
      if (this.hasLoadedItems()) {
        hadItems = true;
      }
      const pendingEmpty = this.status() === 'pending' && !this.hasLoadedItems();
      if (!pendingEmpty) {
        this.skeletonDelayElapsed.set(false);
        return;
      }
      if (hadItems) {
        this.skeletonDelayElapsed.set(true);
        return;
      }
      const timer = setTimeout(() => this.skeletonDelayElapsed.set(true), SKELETON_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
