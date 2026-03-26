import { Component, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-password',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'block' },
  template: `
    <div class="relative">
      <input
        [type]="visible() ? 'text' : 'password'"
        [placeholder]="placeholder()"
        [ngModel]="value()"
        (ngModelChange)="value.set($event)"
        [disabled]="disabled()"
        class="w-full h-9 px-3 pr-9 bg-surface-raised text-sm text-ink border-none rounded-[6px] shadow-paper outline-none transition-all placeholder:text-ink-muted focus:ring-1 focus:ring-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        type="button"
        (click)="visible.set(!visible())"
        [attr.aria-label]="visible() ? 'Hide password' : 'Show password'"
        class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-ink-muted hover:text-ink-light transition-colors cursor-pointer"
      >
        @if (visible()) {
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <path d="m1 1 22 22"/>
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
          </svg>
        } @else {
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        }
      </button>
    </div>
  `,
})
export class PasswordComponent {
  value = model('');
  placeholder = input('');
  disabled = input(false);
  visible = signal(false);
}
