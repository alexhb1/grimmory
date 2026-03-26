import { Component, computed, input, model } from '@angular/core';

@Component({
  selector: 'app-radio',
  standalone: true,
  host: { class: 'block' },
  template: `
    <label class="flex items-center gap-2 cursor-pointer" [class.opacity-50]="disabled()" [class.pointer-events-none]="disabled()">
      <button
        type="button"
        role="radio"
        [attr.aria-checked]="isSelected()"
        [disabled]="disabled()"
        (click)="select()"
        class="h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-accent/20"
        [class]="isSelected() ? 'border-accent' : 'border-edge'"
      >
        @if (isSelected()) {
          <span class="h-2 w-2 rounded-full bg-accent"></span>
        }
      </button>
      <ng-content />
    </label>
  `,
})
export class RadioComponent {
  name = input.required<string>();
  value = input.required<string>();
  selected = model<string>('');
  disabled = input(false);

  isSelected = computed(() => this.selected() === this.value());

  select() {
    if (!this.disabled()) {
      this.selected.set(this.value());
    }
  }
}
