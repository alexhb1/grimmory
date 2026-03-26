import { Component, ElementRef, effect, inject, input, model, AfterViewInit, signal } from '@angular/core';

@Component({
  selector: 'app-tab-panel',
  standalone: true,
  template: `
    @if (tabs.value() === value()) {
      <div class="pt-4">
        <ng-content />
      </div>
    }
  `,
  host: { class: 'block' },
})
export class TabPanelComponent {
  tabs = inject(TabsComponent);
  value = input.required<string>();
}

@Component({
  selector: 'app-tab',
  standalone: true,
  template: `
    <button
      type="button"
      role="tab"
      [attr.aria-selected]="isActive()"
      (click)="tabs.value.set(value())"
      class="tab-btn"
      [class.tab-active]="isActive()"
    >
      <ng-content />
    </button>
  `,
  styles: [`
    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border: none;
      background: none;
      font-size: 13px;
      color: var(--color-ink-muted);
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.15s ease;
      outline: none;
    }
    .tab-btn:hover {
      color: var(--color-ink);
    }
    .tab-btn:focus-visible {
      box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--color-accent) 40%, transparent);
      border-radius: 4px;
    }
    .tab-active {
      color: var(--color-accent-text);
    }
  `],
  host: { class: 'inline-flex' },
})
export class TabComponent {
  tabs = inject(TabsComponent);
  value = input.required<string>();
  el = inject(ElementRef);

  isActive() {
    return this.tabs.value() === this.value();
  }
}

@Component({
  selector: 'app-tab-list',
  standalone: true,
  template: `
    <div
      class="tab-list"
      [class.tab-list-scrollable]="scrollable()"
      role="tablist"
    >
      <ng-content />
      <div
        class="tab-indicator"
        [class.tab-indicator-ready]="indicatorReady()"
        [style.left.px]="indicatorLeft()"
        [style.width.px]="indicatorWidth()"
      ></div>
    </div>
  `,
  styles: [`
    .tab-list {
      display: flex;
      position: relative;
      border-bottom: 1px solid var(--color-edge);
    }
    .tab-list-scrollable {
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tab-list-scrollable::-webkit-scrollbar {
      display: none;
    }
    .tab-indicator {
      position: absolute;
      bottom: 0;
      height: 2px;
      background: var(--color-accent);
      border-radius: 1px;
      transition: left 0.2s ease, width 0.2s ease;
    }
    .tab-indicator:not(.tab-indicator-ready) {
      transition: none;
    }
  `],
  host: { class: 'block' },
})
export class TabListComponent implements AfterViewInit {
  scrollable = input(false);

  private tabs = inject(TabsComponent);
  private el = inject(ElementRef);

  indicatorLeft = signal(0);
  indicatorWidth = signal(0);
  indicatorReady = signal(false);

  constructor() {
    effect(() => {
      // Track value changes
      this.tabs.value();
      // Defer to after Angular has rendered the new active class
      requestAnimationFrame(() => this.updateIndicator());
    });
  }

  ngAfterViewInit() {
    // Initial position without transition
    requestAnimationFrame(() => {
      this.updateIndicator();
      // Enable transitions after first paint
      requestAnimationFrame(() => this.indicatorReady.set(true));
    });
  }

  private updateIndicator() {
    const listEl = this.el.nativeElement.querySelector('.tab-list') as HTMLElement;
    if (!listEl) return;
    const activeBtn = listEl.querySelector('.tab-active') as HTMLElement;
    if (!activeBtn) return;

    const listRect = listEl.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();

    this.indicatorLeft.set(btnRect.left - listRect.left + listEl.scrollLeft);
    this.indicatorWidth.set(btnRect.width);
  }
}

@Component({
  selector: 'app-tabs',
  standalone: true,
  template: `<ng-content />`,
  host: { class: 'block' },
})
export class TabsComponent {
  value = model.required<string>();
}
