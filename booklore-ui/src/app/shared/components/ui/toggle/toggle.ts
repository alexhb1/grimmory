import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-toggle',
  standalone: true,
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="checked()"
      [disabled]="disabled()"
      (click)="checked.set(!checked())"
      class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
      [class]="checked() ? 'bg-accent' : 'bg-surface-hover'"
    >
      <span
        class="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
        [class]="checked() ? 'translate-x-6' : 'translate-x-1'"
      ></span>
    </button>
  `,
})
export class ToggleComponent {
  checked = model(false);
  disabled = input(false);
}
