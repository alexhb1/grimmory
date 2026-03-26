import { Component, input, model } from '@angular/core';

export interface SelectButtonOption {
  label: string;
  value: string;
  icon?: string;
  swatch?: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-select-button',
  standalone: true,
  template: `
    <div
      [attr.role]="multiple() ? 'group' : 'radiogroup'"
      class="inline-flex rounded-[6px] shadow-paper overflow-hidden"
      [class.opacity-50]="disabled()"
      [class.pointer-events-none]="disabled()"
    >
      @for (option of options(); track option.value; let last = $last) {
        <button
          type="button"
          [attr.role]="multiple() ? 'checkbox' : 'radio'"
          [attr.aria-checked]="isActive(option.value)"
          [disabled]="disabled() || !!option.disabled"
          (click)="select(option)"
          class="sb-btn"
          [class.sb-active]="isActive(option.value)"
          [class.sb-divider]="!last"
        >
          @if (option.swatch) {
            <span class="sb-swatch" [style.background]="option.swatch"></span>
          }
          @if (option.icon) {
            <i [class]="option.icon" class="sb-icon"></i>
          }
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: [`
    .sb-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      font-size: 14px;
      border: none;
      outline: none;
      cursor: pointer;
      transition: background 0.1s ease, color 0.1s ease;
      background: var(--color-surface-raised);
      color: var(--color-ink-light);
    }
    .sb-btn:hover {
      background: var(--color-surface-hover);
      color: var(--color-ink);
    }
    .sb-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .sb-btn:focus-visible {
      box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--color-accent) 40%, transparent);
      z-index: 1;
      position: relative;
    }
    .sb-active {
      background: var(--color-accent-wash);
      color: var(--color-accent-text);
    }
    .sb-active:hover {
      background: var(--color-accent-wash);
      color: var(--color-accent-text);
    }
    .sb-divider {
      border-right: 1px solid var(--color-surface-hover);
    }
    .sb-swatch {
      width: 10px;
      height: 10px;
      border-radius: 9999px;
    }
    .sb-icon {
      font-size: 13px;
    }
  `],
})
export class SelectButtonComponent {
  options = input.required<SelectButtonOption[]>();
  value = model<string>('');
  values = model<string[]>([]);
  multiple = input(false);
  disabled = input(false);
  allowEmpty = input(false);

  isActive(val: string): boolean {
    return this.multiple() ? this.values().includes(val) : this.value() === val;
  }

  select(option: SelectButtonOption) {
    if (this.multiple()) {
      const current = this.values();
      if (current.includes(option.value)) {
        this.values.set(current.filter(v => v !== option.value));
      } else {
        this.values.set([...current, option.value]);
      }
    } else {
      if (option.value === this.value() && this.allowEmpty()) {
        this.value.set('');
      } else {
        this.value.set(option.value);
      }
    }
  }
}
