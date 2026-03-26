import { Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

@Component({
  selector: 'app-button',
  standalone: true,
  host: {
    '[class]': 'classes()',
  },
  template: `<ng-content />`,
})
export class ButtonComponent {
  variant = input<ButtonVariant>('secondary');
  disabled = input(false);

  private base = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 text-sm rounded-[6px] cursor-pointer transition-all whitespace-nowrap select-none';

  private variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-white font-medium shadow-paper hover:bg-accent-hover hover:shadow-paper-hover',
    secondary: 'bg-surface-raised text-ink-light shadow-paper hover:bg-surface-hover hover:text-ink hover:shadow-paper-hover',
    danger: 'bg-surface-raised text-status-abandoned shadow-paper hover:bg-status-abandoned-bg hover:shadow-paper-hover',
    ghost: 'bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink-light',
  };

  classes = computed(() => {
    const variant = this.variantClasses[this.variant()];
    const disabled = this.disabled() ? 'opacity-50 pointer-events-none' : '';
    return `${this.base} ${variant} ${disabled}`;
  });
}
