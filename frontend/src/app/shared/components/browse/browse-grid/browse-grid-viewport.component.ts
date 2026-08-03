import {NgTemplateOutlet} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  Signal,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  runInInjectionContext,
  signal,
} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {type VirtualItem} from '@tanstack/angular-virtual';

import {RouteScrollPositionService} from '../../../service/route-scroll-position.service';
import {createVirtualGrid, type VirtualGridScrollMode} from '../../../util/virtual-grid.util';
import {type BrowseGridItemContext} from './browse-grid.directives';
import {skeletonFillCount} from './browse-grid.util';

export interface BrowseGridVisibleRange {
  start: number;
  end: number;
}

export interface BrowseGridDensityFacade {
  gridColumns: Signal<number>;
  viewportWidth: Signal<number>;
  updatePreservingScrollPosition: (update: () => void) => void;
}

type VirtualGrid = ReturnType<typeof createVirtualGrid>;

@Component({
  selector: 'app-browse-grid-viewport',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: {class: 'block w-full min-w-0'},
  template: `
    @if (grid(); as g) {
      <div class="relative w-full" [style.height.px]="g.virtualizer.getTotalSize()">
        @for (item of g.virtualizer.getVirtualItems(); track item.key) {
          <div
            class="absolute left-0 top-0"
            [style.width.px]="g.itemWidth()"
            [style.transform]="g.itemTransform(item)">
            @if (skeletonFill() || items()[item.index] === undefined) {
              <ng-container [ngTemplateOutlet]="skeletonTemplate()" />
            } @else {
              <ng-container
                [ngTemplateOutlet]="itemTemplate()"
                [ngTemplateOutletContext]="itemContext(item.index)" />
            }
          </div>
        }
      </div>
    }
  `,
})
export class BrowseGridViewportComponent implements OnInit {
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly scrollPosition = inject(RouteScrollPositionService);

  readonly items = input.required<readonly unknown[]>();
  readonly itemKey = input.required<(item: unknown) => VirtualItem['key']>();
  readonly hasNextPage = input.required<boolean>();
  readonly fixedColumns = input.required<number | undefined>();
  readonly minItemWidth = input.required<number>();
  readonly gap = input.required<number>();
  readonly rowGap = input.required<number | undefined>();
  readonly estimateItemHeight = input.required<(itemWidth: number) => number>();
  readonly itemTemplate = input.required<TemplateRef<BrowseGridItemContext<unknown>>>();
  readonly skeletonTemplate = input.required<TemplateRef<unknown>>();
  readonly skeletonFill = input.required<boolean>();
  readonly scrollMode = input.required<VirtualGridScrollMode>();

  readonly visibleRange = output<BrowseGridVisibleRange>();

  protected readonly grid = signal<VirtualGrid | null>(null);
  private readonly scrollElementRef = signal<ElementRef<HTMLElement> | undefined>(undefined);
  private readonly scrollMargin = signal(0);
  private readonly initialScrollOffset = () =>
    this.scrollPosition.getPosition(this.scrollPosition.keyFor(this.route, 'grid')) ?? 0;
  private lastVisibleRange: BrowseGridVisibleRange | null = null;
  private scrollRestored = false;

  constructor() {
    this.scrollPosition.trackRoute({
      scrollElement: this.scrollElementRef,
      route: this.route,
      destroyRef: this.destroyRef,
      keySuffix: 'grid',
    });

    effect(() => {
      const g = this.grid();
      if (!g || this.scrollRestored || this.skeletonFill() || this.items().length === 0) {
        return;
      }
      this.scrollRestored = true;
      const offset = this.initialScrollOffset();
      if (offset > 0) {
        queueMicrotask(() => {
          requestAnimationFrame(() => {
            g.virtualizer.scrollToOffset(offset);
            requestAnimationFrame(() => g.virtualizer.scrollToOffset(offset));
          });
        });
      }
    });

    effect(() => {
      const g = this.grid();
      if (!g || this.skeletonFill()) {
        return;
      }
      const rendered = g.virtualizer.getVirtualItems();
      const length = this.items().length;
      if (rendered.length === 0 || length === 0) {
        return;
      }
      const range = {
        start: rendered[0].index,
        end: rendered[rendered.length - 1].index,
      };
      if (
        this.lastVisibleRange?.start !== range.start ||
        this.lastVisibleRange.end !== range.end
      ) {
        this.lastVisibleRange = range;
        this.visibleRange.emit(range);
      }
    });
  }

  ngOnInit(): void {
    if (this.scrollMode() === 'window') {
      this.enterWindowMode();
    } else {
      this.scrollElementRef.set(this.resolveLayoutMain());
    }

    runInInjectionContext(this.injector, () => {
      this.grid.set(
        createVirtualGrid({
          items: this.items,
          itemKey: item => this.itemKey()(item),
          scrollElement: this.scrollElementRef,
          minItemWidth: computed(() => this.minItemWidth()),
          gap: computed(() => this.gap()),
          rowGap: computed(() => this.rowGap() ?? this.gap()),
          estimateItemHeight: width => this.estimateItemHeight()(width),
          trailingRows: computed(() => this.hasNextPage() ? 1 : 0),
          columns: computed(() => this.fixedColumns()),
          fillItemWidth: true,
          scrollMode: this.scrollMode(),
          scrollMargin: this.scrollMode() === 'window' ? this.scrollMargin : undefined,
          measureElement: signal(this.hostRef),
          minimumCount: metrics =>
            this.skeletonFill()
              ? skeletonFillCount(metrics.viewportHeight, metrics.columns, metrics.itemHeight, metrics.gap)
              : 0,
          initialOffset: this.initialScrollOffset,
        }),
      );
    });
  }

  protected itemContext(index: number): BrowseGridItemContext<unknown> {
    return {$implicit: this.items()[index], index};
  }

  scrollToTop(): void {
    if (this.scrollMode() === 'window') {
      window.scrollTo({top: 0});
      return;
    }
    const scroller = this.scrollElementRef()?.nativeElement;
    if (scroller) {
      scroller.scrollTop = 0;
    }
  }

  densityFacade(): BrowseGridDensityFacade | null {
    const g = this.grid();
    if (!g) {
      return null;
    }
    return {
      gridColumns: g.gridColumns,
      viewportWidth: g.viewportWidth,
      updatePreservingScrollPosition: g.updatePreservingScrollPosition,
    };
  }

  private resolveLayoutMain(): ElementRef<HTMLElement> | undefined {
    const el = this.hostRef.nativeElement.closest<HTMLElement>('.layout-main');
    return el ? new ElementRef(el) : undefined;
  }

  private enterWindowMode(): void {
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    this.scrollElementRef.set(new ElementRef(document.scrollingElement as HTMLElement));

    const measureMargin = (): void => {
      const top = this.hostRef.nativeElement.getBoundingClientRect().top + window.scrollY;
      this.scrollMargin.set(Math.max(0, Math.round(top)));
    };
    measureMargin();

    window.addEventListener('resize', measureMargin, {passive: true});

    const target = this.hostRef.nativeElement.closest<HTMLElement>('.app-page')!;
    const marginObserver = new ResizeObserver(measureMargin);
    marginObserver.observe(target);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', measureMargin);
      marginObserver.disconnect();
      history.scrollRestoration = previousRestoration;
    });
  }
}
