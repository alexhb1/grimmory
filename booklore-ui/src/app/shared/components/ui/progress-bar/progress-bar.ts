import { Component, computed, input } from '@angular/core';

export type ProgressBarSeverity = 'default' | 'info' | 'success' | 'warn' | 'danger';

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  host: {
    'role': 'progressbar',
    '[attr.aria-valuenow]': 'value()',
    '[attr.aria-valuemin]': '0',
    '[attr.aria-valuemax]': '100',
  },
  template: `
    <div class="w-full overflow-hidden rounded-full" [class]="trackClass()">
      <div
        class="h-full rounded-full transition-all duration-300"
        [class]="fillClass()"
        [style.width.%]="clampedValue()"
      ></div>
    </div>
    @if (showValue()) {
      <span class="ml-2 text-xs text-ink-muted tabular-nums">{{ clampedValue() }}%</span>
    }
  `,
})
export class ProgressBarComponent {
  value = input(0);
  showValue = input(false);
  severity = input<ProgressBarSeverity>('default');
  size = input<'sm' | 'md'>('md');

  clampedValue = computed(() => Math.min(100, Math.max(0, this.value())));

  private sizeHeight: Record<string, string> = {
    sm: 'h-1',
    md: 'h-2',
  };

  trackClass = computed(() => `${this.sizeHeight[this.size()]} bg-surface-hover`);

  private fillClasses: Record<ProgressBarSeverity, string> = {
    default: 'bg-accent',
    info: 'bg-status-reading',
    success: 'bg-status-finished',
    warn: 'bg-status-to-read',
    danger: 'bg-status-abandoned',
  };

  fillClass = computed(() => this.fillClasses[this.severity()]);
}
