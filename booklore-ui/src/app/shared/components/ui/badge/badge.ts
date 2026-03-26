import { Component, computed, input } from '@angular/core';

export type BadgeSeverity = 'default' | 'info' | 'success' | 'warn' | 'danger';

@Component({
  selector: 'app-badge',
  standalone: true,
  host: {
    '[class]': 'classes()',
    'aria-hidden': 'true',
  },
  template: `<ng-content />`,
})
export class BadgeComponent {
  severity = input<BadgeSeverity>('default');

  private base = 'inline-flex items-center justify-center min-w-[18px] h-[18px] mx-1 px-1.5 text-[10px] font-semibold rounded-full leading-none relative -top-px';

  private severityClasses: Record<BadgeSeverity, string> = {
    default: 'bg-surface-hover text-ink-light',
    info: 'bg-status-reading-bg text-status-reading',
    success: 'bg-status-finished-bg text-status-finished',
    warn: 'bg-status-to-read-bg text-status-to-read',
    danger: 'bg-status-abandoned-bg text-status-abandoned',
  };

  classes = computed(() => `${this.base} ${this.severityClasses[this.severity()]}`);
}
