import { Component, computed, input } from '@angular/core';

export type TagSeverity = 'default' | 'info' | 'success' | 'warn' | 'danger';

@Component({
  selector: 'app-tag',
  standalone: true,
  host: {
    '[class]': 'classes()',
  },
  template: `
    @if (icon()) {
      <span class="mr-1" [innerHTML]="icon()"></span>
    }
    <ng-content />
  `,
})
export class TagComponent {
  severity = input<TagSeverity>('default');
  rounded = input(false);
  icon = input<string | undefined>(undefined);

  private base = 'inline-flex items-center h-6 px-2.5 text-[11px] font-semibold tracking-wide leading-none';

  private severityClasses: Record<TagSeverity, string> = {
    default: 'bg-surface-hover text-ink-light',
    info: 'bg-status-reading-bg text-status-reading',
    success: 'bg-status-finished-bg text-status-finished',
    warn: 'bg-status-to-read-bg text-status-to-read',
    danger: 'bg-status-abandoned-bg text-status-abandoned',
  };

  classes = computed(() => {
    const severity = this.severityClasses[this.severity()];
    const radius = this.rounded() ? 'rounded-full' : 'rounded-[4px]';
    return `${this.base} ${severity} ${radius}`;
  });
}
