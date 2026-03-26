import { Component, input, model, output, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-slider',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex items-center gap-3" [class.opacity-50]="disabled()" [class.pointer-events-none]="disabled()">
      <input
        type="range"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [ngModel]="value()"
        (ngModelChange)="value.set($event)"
        (input)="onChange.emit($event)"
        (change)="onSlideEnd.emit($event)"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel()"
        [style.--fill-pct]="fillPercent() + '%'"
        class="app-slider w-full h-2 appearance-none cursor-pointer rounded-full bg-transparent outline-none
               [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full
               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
               [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-paper
               [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:transition-shadow [&::-webkit-slider-thumb]:duration-150
               [&::-webkit-slider-thumb]:hover:shadow-paper-hover
               [&::-webkit-slider-thumb]:active:scale-110
               [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-hover
               [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
               [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-paper
               [&::-moz-range-thumb]:transition-shadow [&::-moz-range-thumb]:duration-150
               [&::-moz-range-thumb]:hover:shadow-paper-hover
               focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-accent/30
               focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-accent/30"
      />
    </div>
  `,
  styles: [`
    .app-slider::-webkit-slider-runnable-track {
      background: linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) var(--fill-pct), var(--color-surface-hover) var(--fill-pct), var(--color-surface-hover) 100%);
    }
    .app-slider::-moz-range-progress {
      background-color: var(--color-accent);
      border-radius: 9999px;
      height: 0.5rem;
    }
  `],
})
export class SliderComponent {
  value = model(0);
  min = input(0);
  max = input(100);
  step = input(1);
  disabled = input(false);
  ariaLabel = input<string | null>(null);

  onChange = output<Event>();
  onSlideEnd = output<Event>();

  fillPercent = computed(() => {
    const range = this.max() - this.min();
    if (range <= 0) return 0;
    return ((this.value() - this.min()) / range) * 100;
  });
}
