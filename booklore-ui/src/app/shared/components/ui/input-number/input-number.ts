import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-input-number',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="inline-flex items-center gap-0 rounded-[6px] shadow-paper">
      <button
        type="button"
        (click)="decrement()"
        [disabled]="disabled() || atMin()"
        class="h-9 w-8 flex items-center justify-center bg-surface-raised rounded-l-[4px] text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>
      </button>
      <input
        type="number"
        [ngModel]="value()"
        (ngModelChange)="onInput($event)"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [disabled]="disabled()"
        class="relative h-9 w-14 text-center bg-surface-raised border-none text-sm text-ink outline-none focus:ring-1 focus:ring-accent/50 focus:z-10 transition-all disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        (click)="increment()"
        [disabled]="disabled() || atMax()"
        class="h-9 w-8 flex items-center justify-center bg-surface-raised rounded-r-[4px] text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      </button>
    </div>
  `,
})
export class InputNumberComponent {
  value = model(0);
  min = input<number | null>(null);
  max = input<number | null>(null);
  step = input(1);
  disabled = input(false);

  atMin(): boolean {
    const m = this.min();
    return m !== null && this.value() <= m;
  }

  atMax(): boolean {
    const m = this.max();
    return m !== null && this.value() >= m;
  }

  increment() {
    const next = this.value() + this.step();
    const m = this.max();
    this.value.set(m !== null ? Math.min(next, m) : next);
  }

  decrement() {
    const next = this.value() - this.step();
    const m = this.min();
    this.value.set(m !== null ? Math.max(next, m) : next);
  }

  onInput(val: number) {
    const minVal = this.min();
    const maxVal = this.max();
    let clamped = val;
    if (minVal !== null) clamped = Math.max(clamped, minVal);
    if (maxVal !== null) clamped = Math.min(clamped, maxVal);
    this.value.set(clamped);
  }
}
