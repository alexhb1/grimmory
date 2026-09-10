import {
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {LucideEllipsis, LucideX} from '@lucide/angular';

import {AppButtonComponent} from '../../ui/button/app-button.component';
import {AppMenuComponent} from '../../ui/menu/app-menu.component';
import {AppMenuTriggerDirective} from '../../ui/menu/app-menu-trigger.directive';
import {LayoutService} from '../../layout/layout.service';

const PILL_CHROME_WIDTH = 46;
const ITEM_GAP = 4;
const MORE_BUTTON_WIDTH = 40 + ITEM_GAP;

@Component({
  selector: 'app-browse-bulk-actions-divider',
  template: `@if (!mobileShell()) {
    <span class="mx-1.5 block h-6 w-px bg-border" aria-hidden="true"></span>
  }`,
  host: {class: 'contents'},
})
export class BrowseBulkActionsDividerComponent {
  private readonly layout = inject(LayoutService);
  protected readonly mobileShell = computed(() => !this.layout.isDesktop());
}

@Directive({
  selector: '[appBrowseBulkActionsItem]',
  host: {
    '[class.invisible]': 'overflowed()',
    '[class.absolute]': 'overflowed()',
    '[class.left-0]': 'overflowed()',
    '[class.top-0]': 'overflowed()',
    '[attr.inert]': "overflowed() ? '' : null",
  },
})
export class BrowseBulkActionsItemDirective {
  readonly id = input.required<string>({alias: 'appBrowseBulkActionsItem'});
  readonly width = signal(0);

  private readonly bar = inject(BrowseBulkActionsBarComponent);
  protected readonly overflowed = computed(() => this.bar.overflowed().has(this.id()));

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const observer = new ResizeObserver(() => this.width.set(element.offsetWidth));
    observer.observe(element);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}

@Component({
  selector: 'app-browse-bulk-actions-bar',
  imports: [TranslocoPipe, AppButtonComponent, AppMenuTriggerDirective, BrowseBulkActionsDividerComponent, LucideEllipsis, LucideX],
  host: {class: 'contents'},
  template: `
    <div
      #strip
      class="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex justify-center pl-[calc(var(--sidebar-width,0px)*(1-var(--mobile-shell-active,0)))]"
    >
      <div
        class="pointer-events-auto relative flex h-12 max-w-[calc(100%-2rem)] items-center gap-1 overflow-hidden whitespace-nowrap rounded-xl border border-border bg-card px-1.5 text-sm shadow-float animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
      >
      @if (!mobileShell()) {
        <span #leading class="flex items-center gap-1">
          <app-button
            variant="ghost"
            size="md"
            iconOnly
            [ariaLabel]="'shared.ui.select.clearSelection' | transloco"
            (clicked)="clearSelection.emit()"
          >
            <svg lucideX aria-hidden="true"></svg>
          </app-button>
          <span role="status" class="px-1 font-semibold tabular-nums text-text">
            {{ 'shared.ui.select.selectedCount' | transloco: {count: countLabel()} }}
          </span>
          @if (showSelectAll()) {
            <app-button
              variant="ghost"
              tone="primary"
              size="md"
              [label]="'shared.ui.bulkActions.selectAll' | transloco"
              (clicked)="selectAll.emit()"
            />
          }
          <app-browse-bulk-actions-divider />
        </span>
      }
      <ng-content />
      @if (moreMenu(); as menu) {
        @if (moreShown()) {
          <app-button
            variant="ghost"
            size="md"
            iconOnly
            [disabled]="moreDisabled()"
            [ariaLabel]="'browse.moreActions' | transloco"
            [appMenuTriggerFor]="menu"
          >
            <svg lucideEllipsis aria-hidden="true"></svg>
          </app-button>
        }
      }
      <ng-content select="[appBrowseBulkActionsTrailing]" />
      </div>
    </div>
  `,
})
export class BrowseBulkActionsBarComponent {
  readonly count = input.required<number>();
  readonly total = input<number | null>(null);
  readonly moreMenu = input<AppMenuComponent | null>(null);
  readonly moreAlways = input(false);
  readonly moreDisabled = input(false);

  readonly clearSelection = output<void>();
  readonly selectAll = output<void>();

  readonly availableWidth = signal(window.innerWidth);

  private readonly layout = inject(LayoutService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly strip = viewChild.required<ElementRef<HTMLElement>>('strip');
  private readonly leading = viewChild<ElementRef<HTMLElement>>('leading');
  private readonly items = contentChildren(BrowseBulkActionsItemDirective);
  private readonly leadingWidth = signal(0);

  readonly overflowed = computed<ReadonlySet<string>>(() => {
    const capacity = this.availableWidth() - PILL_CHROME_WIDTH - this.leadingWidth();
    const capacityWithMoreButton = capacity - MORE_BUTTON_WIDTH;
    const items = this.items().map(item => ({id: item.id(), width: item.width() + ITEM_GAP}));
    if (this.moreAlways()) {
      return overflowingIds(items, capacityWithMoreButton);
    }
    const withoutMoreButton = overflowingIds(items, capacity);
    return withoutMoreButton.size === 0 ? withoutMoreButton : overflowingIds(items, capacityWithMoreButton);
  }, {equal: sameIds});

  protected readonly mobileShell = computed(() => !this.layout.isDesktop());
  protected readonly countLabel = computed(() => this.count().toLocaleString());
  protected readonly showSelectAll = computed(() => {
    const total = this.total();
    return total !== null && this.count() < total;
  });
  protected readonly moreShown = computed(() => this.moreAlways() || this.overflowed().size > 0);

  constructor() {
    afterNextRender(() => {
      const observer = new ResizeObserver(entries => {
        this.availableWidth.set(entries.at(-1)!.contentRect.width);
      });
      observer.observe(this.strip().nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });

    effect(onCleanup => {
      const element = this.leading()?.nativeElement;
      if (!element) {
        this.leadingWidth.set(0);
        return;
      }
      const observer = new ResizeObserver(() => this.leadingWidth.set(element.offsetWidth + ITEM_GAP));
      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });
  }
}

function overflowingIds(items: readonly {id: string; width: number}[], capacity: number): ReadonlySet<string> {
  const overflowed = new Set<string>();
  let used = 0;
  for (const item of items) {
    if (overflowed.size === 0 && used + item.width <= capacity) {
      used += item.width;
    } else {
      overflowed.add(item.id);
    }
  }
  return overflowed;
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(id => b.has(id));
}
