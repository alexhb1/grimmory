import { Component, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { TieredMenu } from 'primeng/tieredmenu';
import { MenuItem } from 'primeng/api';
import { PopupMenuService } from '../services/popup-menu.service';

export type SplitButtonVariant = 'primary' | 'secondary' | 'danger';

@Component({
  selector: 'app-split-button',
  standalone: true,
  imports: [TieredMenu],
  template: `
    <div #container class="sb-container">
      <button
        type="button"
        class="sb-main"
        [class]="'sb-main sb-' + variant()"
        [disabled]="disabled()"
        (click)="clicked.emit()"
      >
        @if (icon()) {
          <i [class]="icon()!"></i>
        }
        {{ label() }}
      </button>
      <button
        type="button"
        class="sb-toggle"
        [class]="'sb-toggle sb-' + variant()"
        [disabled]="disabled()"
        (click)="onToggle($event)"
      >
        <svg class="sb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
    </div>
    <p-tieredMenu #menu [model]="items()" [popup]="true" appendTo="body" />
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; }
    .sb-container {
      display: inline-flex;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: var(--shadow-paper);
      transition: box-shadow 0.15s ease;
    }
    .sb-container:hover {
      box-shadow: var(--shadow-paper-hover);
    }
    .sb-main, .sb-toggle {
      border: none;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.1s ease, opacity 0.1s ease;
      outline: none;
    }
    .sb-main {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
    }
    .sb-main i { font-size: 13px; }
    .sb-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 32px;
      border-left: 1px solid rgba(255, 255, 255, 0.15);
    }
    .sb-chevron {
      width: 14px;
      height: 14px;
    }
    .sb-main:disabled, .sb-toggle:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Primary */
    .sb-primary { background: var(--color-accent); color: white; font-weight: 500; }
    .sb-primary:hover:not(:disabled) { background: var(--color-accent-hover); }

    /* Secondary */
    .sb-secondary { background: var(--color-surface-raised); color: var(--color-ink-light); }
    .sb-secondary:hover:not(:disabled) { background: var(--color-surface-hover); color: var(--color-ink); }
    .sb-secondary.sb-toggle { border-left-color: var(--color-surface-hover); }

    /* Danger */
    .sb-danger { background: var(--color-status-abandoned); color: white; }
    .sb-danger:hover:not(:disabled) { opacity: 0.9; }
  `],
})
export class SplitButtonComponent {
  label = input.required<string>();
  icon = input<string | null>(null);
  items = input.required<MenuItem[]>();
  variant = input<SplitButtonVariant>('primary');
  disabled = input(false);

  clicked = output<void>();

  private menu = viewChild<TieredMenu>('menu');
  private hostEl = inject(ElementRef);
  private popupService = inject(PopupMenuService);

  onToggle(event: Event) {
    event.stopPropagation();
    const m = this.menu();
    if (!m) return;
    this.popupService.register(m);
    const el = this.hostEl.nativeElement;
    const syntheticEvent = { ...event, currentTarget: el, target: el };
    m.toggle(syntheticEvent as any);
  }
}
