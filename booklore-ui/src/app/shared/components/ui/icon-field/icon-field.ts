import { Component, input } from '@angular/core';

export type IconFieldPosition = 'left' | 'right';

@Component({
  selector: 'app-icon-field',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="relative">
      <span
        class="absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 text-ink-muted pointer-events-none"
        [class]="position() === 'left' ? 'left-3' : 'right-3'"
        aria-hidden="true"
      >
        <ng-content select="[icon]" />
      </span>
      <ng-content />
    </div>
  `,
})
export class IconFieldComponent {
  position = input<IconFieldPosition>('left');
}
