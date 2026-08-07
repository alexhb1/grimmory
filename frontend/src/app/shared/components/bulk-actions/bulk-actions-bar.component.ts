import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {LucideX} from '@lucide/angular';

import {AppButtonComponent} from '../../ui/button/app-button.component';
import {LayoutService} from '../../layout/layout.service';

@Component({
  selector: 'app-bulk-actions-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, AppButtonComponent, LucideX],
  host: {class: 'contents'},
  template: `
    <div
      #strip
      class="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex justify-center pl-[calc(var(--sidebar-width,0px)*(1-var(--mobile-shell-active,0)))]"
    >
      <div
        class="pointer-events-auto flex h-12 max-w-[calc(100%-2rem)] items-center gap-1 overflow-x-auto whitespace-nowrap rounded-xl border border-border bg-card px-1.5 text-sm shadow-float animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
      >
      @if (!mobileShell()) {
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
      }
      @if (!mobileShell() && showSelectAll()) {
        <app-button
          variant="ghost"
          tone="primary"
          size="md"
          [label]="'shared.ui.bulkActions.selectAll' | transloco"
          (clicked)="selectAll.emit()"
        />
      }
      <ng-content />
      </div>
    </div>
  `,
})
export class BulkActionsBarComponent {
  readonly count = input.required<number>();
  readonly total = input<number | null>(null);

  readonly clearSelection = output<void>();
  readonly selectAll = output<void>();

  readonly availableWidth = signal(0);

  private readonly layout = inject(LayoutService);
  protected readonly mobileShell = computed(() => !this.layout.isDesktop());

  private readonly destroyRef = inject(DestroyRef);
  private readonly strip = viewChild.required<ElementRef<HTMLElement>>('strip');

  constructor() {
    afterNextRender(() => {
      const observer = new ResizeObserver(entries => {
        this.availableWidth.set(entries.at(-1)!.contentRect.width);
      });
      observer.observe(this.strip().nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected readonly countLabel = computed(() => this.count().toLocaleString());
  protected readonly showSelectAll = computed(() => {
    const total = this.total();
    return total !== null && this.count() < total;
  });
}

@Component({
  selector: 'app-bulk-actions-divider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (!mobileShell()) {
    <span class="mx-1.5 block h-6 w-px bg-border" aria-hidden="true"></span>
  }`,
  host: {class: 'contents'},
})
export class BulkActionsDividerComponent {
  private readonly layout = inject(LayoutService);
  protected readonly mobileShell = computed(() => !this.layout.isDesktop());
}
