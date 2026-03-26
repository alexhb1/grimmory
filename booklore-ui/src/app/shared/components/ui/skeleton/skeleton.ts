import { Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.border-radius]': 'borderRadius()',
  },
  template: '',
  styles: [`
    :host {
      display: block;
      overflow: hidden;
      position: relative;
      background: var(--color-surface-hover);
    }
    :host::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        var(--color-surface-raised) 50%,
        transparent 100%
      );
      animation: shimmer 1.5s ease-in-out infinite;
    }
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
  `],
})
export class SkeletonComponent {
  width = input('100%');
  height = input('1rem');
  borderRadius = input('4px');
}
