import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
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
      @if (selectionError()) {
        <span class="px-1 text-text-muted">{{ 'shared.ui.bulkActions.selectionError' | transloco }}</span>
        <app-button
          variant="ghost"
          tone="primary"
          size="md"
          [label]="'common.retry' | transloco"
          (clicked)="retrySelection.emit()"
        />
      } @else if (!mobileShell() && showSelectAll()) {
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
  readonly selectionError = input(false, {transform: booleanAttribute});

  readonly clearSelection = output<void>();
  readonly selectAll = output<void>();
  readonly retrySelection = output<void>();

  readonly availableWidth = signal(0);

  private readonly layout = inject(LayoutService);
  protected readonly mobileShell = computed(() => !this.layout.isDesktop());

  private readonly destroyRef = inject(DestroyRef);
  private readonly strip = viewChild.required<ElementRef<HTMLElement>>('strip');

  constructor() {
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(entries => {
        const width = entries.at(-1)?.contentRect.width;
        if (width !== undefined) this.availableWidth.set(width);
      });
      observer.observe(this.strip().nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected readonly stripClass = computed(() =>
    this.mobileShell()
      ? 'pointer-events-none fixed inset-x-0 bottom-0 z-30'
      : 'pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center pl-[calc(var(--sidebar-width,0px)*(1-var(--mobile-shell-active,0)))]',
  );
  protected readonly barClass = computed(() =>
    this.mobileShell()
      ? 'pointer-events-auto flex items-center justify-between gap-2 overflow-x-auto whitespace-nowrap border-t border-border bg-card px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-sm shadow-[0_-8px_24px_rgb(0_0_0/0.12)] animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none'
      : 'pointer-events-auto flex h-12 max-w-[calc(100%-2rem)] items-center gap-1 overflow-x-auto whitespace-nowrap rounded-xl border border-border bg-card pl-3.5 pr-2 text-sm shadow-float animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none',
  );

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
