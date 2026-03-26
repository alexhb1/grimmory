import { Component, computed, input } from '@angular/core';

export type SpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-spinner',
  standalone: true,
  host: {
    'role': 'status',
    '[attr.aria-label]': 'label()',
    '[class]': '"inline-flex items-center justify-center"',
  },
  template: `
    <svg [class]="svgClass()" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
      <path class="opacity-80" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; }
    svg { animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class SpinnerComponent {
  size = input<SpinnerSize>('md');
  label = input('Loading');

  private sizeClasses: Record<SpinnerSize, string> = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
  };

  svgClass = computed(() => `${this.sizeClasses[this.size()]} text-accent`);
}
