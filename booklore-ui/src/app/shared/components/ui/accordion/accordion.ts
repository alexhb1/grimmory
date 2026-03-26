import { Component, computed, inject, input, model } from '@angular/core';

@Component({
  selector: 'app-accordion',
  standalone: true,
  template: `<ng-content />`,
  host: { class: 'flex flex-col gap-2' },
})
export class AccordionComponent {
  multiple = input(false);
  value = model<(string | number)[] | string | number | null>(null);

  toggle(panelValue: string | number) {
    const val = this.value();
    if (this.multiple()) {
      const current = Array.isArray(val) ? [...val] : [];
      const idx = current.indexOf(panelValue);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(panelValue);
      }
      this.value.set(current);
    } else {
      this.value.set(val === panelValue ? null : panelValue);
    }
  }

  isOpen(panelValue: string | number): boolean {
    const val = this.value();
    if (Array.isArray(val)) return val.includes(panelValue);
    return val === panelValue;
  }
}

@Component({
  selector: 'app-accordion-panel',
  standalone: true,
  template: `
    <div class="acc-panel" [class.acc-panel-open]="open()">
      <button
        type="button"
        (click)="accordion.toggle(value())"
        [attr.aria-expanded]="open()"
        class="acc-header"
      >
        <div class="acc-header-content">
          <ng-content select="[panel-header]" />
        </div>
        <svg
          class="acc-chevron"
          [class.acc-chevron-open]="open()"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        >
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      @if (open()) {
        <div class="acc-body">
          <ng-content />
        </div>
      }
    </div>
  `,
  styles: [`
    .acc-panel {
      background: var(--color-surface-raised);
      border-radius: 6px;
      box-shadow: var(--shadow-paper);
      overflow: hidden;
    }
    .acc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      transition: background 0.1s ease;
      outline: none;
    }
    .acc-header:hover {
      background: var(--color-surface-hover);
    }
    .acc-header:focus-visible {
      box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--color-accent) 40%, transparent);
    }
    .acc-header-content {
      flex: 1;
      min-width: 0;
    }
    .acc-chevron {
      width: 16px;
      height: 16px;
      color: var(--color-ink-muted);
      flex-shrink: 0;
      transition: transform 0.2s ease;
    }
    .acc-chevron-open {
      transform: rotate(180deg);
    }
    .acc-body {
      padding: 0 12px 12px;
    }
  `],
  host: { class: 'block' },
})
export class AccordionPanelComponent {
  accordion = inject(AccordionComponent);
  value = input.required<string | number>();

  open = computed(() => this.accordion.isOpen(this.value()));
}
