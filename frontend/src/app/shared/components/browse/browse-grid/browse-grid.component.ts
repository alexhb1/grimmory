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
          [label]="'browse.book.retry' | transloco"
          (clicked)="retryInitial.emit()" />
      </div>
    } @else if (viewState() === 'grid' || viewState() === 'skeleton') {
      @if (isDesktop()) {
        <app-browse-grid-viewport
          scrollMode="element"
          [items]="items()"
          [count]="totalCount()"
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
          [count]="totalCount()"
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
              [label]="'browse.book.retry' | transloco"
              (clicked)="retryNextPage.emit()" />
          </div>
        </div>
      }
    }
  `,
})
export class BrowseGridComponent<T> {
  private readonly layout = inject(LayoutService);

  readonly items = input<readonly (T | undefined)[]>([]);
  readonly totalCount = input<number | null>(null);
  readonly status = input<BrowseGridStatus>('pending');
  readonly nextPageError = input(false, {transform: booleanAttribute});
  readonly fixedColumns = input<number | undefined>(undefined);
  readonly minItemWidth = input(150);
  readonly gap = input(16);
  readonly rowGap = input<number | undefined>(undefined);
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
  private readonly hasLoadedItems = computed(() => this.items().some(item => item !== undefined));
  private readonly skeletonDelayElapsed = signal(false);

  protected readonly viewState = computed<BrowseGridViewState>(() => {
    if (this.hasLoadedItems()) {
      return 'grid';
    }
    switch (this.status()) {
      case 'error':
        return 'initial-error';
      case 'success':
        return this.totalCount() === 0 ? 'empty' : 'grid';
      default:
        return this.skeletonDelayElapsed() ? 'skeleton' : 'idle';
    }
  });

  constructor() {
    effect(onCleanup => {
      const pendingEmpty = this.status() === 'pending' && !this.hasLoadedItems();
      if (!pendingEmpty) {
        this.skeletonDelayElapsed.set(false);
        return;
      }
      const timer = setTimeout(() => this.skeletonDelayElapsed.set(true), SKELETON_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
