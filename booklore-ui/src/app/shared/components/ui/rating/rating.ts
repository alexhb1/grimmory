import { Component, computed, input, model, signal } from '@angular/core';

type StarFill = 'full' | 'half' | 'empty';

@Component({
  selector: 'app-rating',
  standalone: true,
  template: `
    @if (expandable()) {
      <div
        class="rt-exp"
        role="radiogroup"
        aria-label="Rating"
        (mouseenter)="onEnter()"
        (mouseleave)="onLeave()"
      >
        @for (star of displayStars(); track $index) {
          <button
            type="button"
            class="rt-estar"
            [class.rt-estar-hidden]="star.hidden"
            [attr.aria-label]="($index + 1) + ' out of 10'"
            (mouseenter)="onStarEnter($index + 1)"
            (click)="onStarClick($index + 1)"
          >
            <svg class="rt-estar-bg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <svg
              class="rt-estar-fg"
              [class.rt-estar-full]="star.fill === 'full'"
              [class.rt-estar-half]="star.fill === 'half'"
              viewBox="0 0 24 24"
            ><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </button>
        }
        <span class="rt-label" [class.rt-label-hover]="expanded() && hoverValue() !== null">
          {{ ratingLabel() }}
        </span>
      </div>
    } @else {
      <div class="rt-container" role="radiogroup" aria-label="Rating">
        @for (star of starArray(); track star) {
          @if (readonly()) {
            <span class="rt-star" [class.rt-filled]="star <= value()">
              <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </span>
          } @else {
            <button
              type="button"
              class="rt-star rt-interactive"
              [class.rt-filled]="star <= value()"
              [attr.aria-label]="star + ' star' + (star > 1 ? 's' : '')"
              (click)="rate(star)"
            >
              <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </button>
          }
        }
      </div>
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      position: relative;
      top: -1px;
    }

    /* ── Standard (non-expandable) ── */
    .rt-container {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      line-height: 0;
    }
    .rt-star {
      display: inline-flex;
      width: 18px;
      height: 18px;
      line-height: 0;
    }
    .rt-star svg {
      width: 100%;
      height: 100%;
      fill: var(--color-surface-hover);
      transition: fill 0.1s ease;
    }
    .rt-filled svg {
      fill: var(--color-yellow-400);
    }
    .rt-interactive {
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      outline: none;
      border-radius: 2px;
    }
    .rt-interactive:hover svg {
      fill: var(--color-yellow-300);
    }
    .rt-interactive:focus-visible {
      box-shadow: 0 0 0 2px color-mix(in oklch, var(--color-yellow-400) 40%, transparent);
    }

    /* ── Expandable ── */
    .rt-exp {
      display: inline-flex;
      align-items: center;
      line-height: 0;
    }

    .rt-estar {
      position: relative;
      display: inline-flex;
      width: 18px;
      height: 18px;
      margin-left: 2px;
      overflow: hidden;
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      outline: none;
      border-radius: 2px;
      transition: width 0.2s ease, opacity 0.2s ease, margin-left 0.2s ease;
    }
    .rt-estar:first-child {
      margin-left: 0;
    }
    .rt-estar:focus-visible {
      box-shadow: 0 0 0 2px color-mix(in oklch, var(--color-yellow-400) 40%, transparent);
    }
    .rt-estar:hover .rt-estar-bg {
      fill: var(--color-yellow-300);
    }

    /* Hidden stars (6-10 when collapsed) */
    .rt-estar-hidden {
      width: 0;
      margin-left: 0;
      opacity: 0;
      pointer-events: none;
    }

    .rt-estar-bg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      fill: var(--color-surface-hover);
      transition: fill 0.1s ease;
    }

    /* Foreground fill layer (always in DOM, visibility via classes) */
    .rt-estar-fg {
      position: absolute;
      inset: 0;
      width: 18px;
      height: 18px;
      fill: var(--color-yellow-400);
      opacity: 0;
      pointer-events: none;
    }
    .rt-estar-full {
      opacity: 1;
    }
    .rt-estar-half {
      opacity: 1;
      clip-path: inset(0 50% 0 0);
    }

    /* Rating label */
    .rt-label {
      margin-left: 6px;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      color: var(--color-ink-muted);
      white-space: nowrap;
      line-height: 1;
      transition: color 0.15s ease;
    }
    .rt-label-hover {
      color: var(--color-yellow-400);
    }
  `],
})
export class RatingComponent {
  value = model(0);
  stars = input(5);
  readonly = input(false);
  expandable = input(false);

  expanded = signal(false);
  hoverValue = signal<number | null>(null);

  /** Label: collapsed shows "X.X / 5" (hidden when 0), expanded shows hover or current as "X / 10" */
  ratingLabel = computed(() => {
    const v = this.value();
    const hover = this.hoverValue();

    if (this.expanded() && hover !== null) {
      return `(${hover} / 10)`;
    }
    if (this.expanded()) {
      return `(${v} / 10)`;
    }
    // Collapsed: hide label when no rating set
    if (v === 0) return '';
    // Show as 5-star scale (e.g. 7→"3.5", 8→"4")
    const half = v / 2;
    const display = v % 2 === 0 ? `${half}` : half.toFixed(1);
    return `(${display} / 5)`;
  });

  /** 10 stars with fill + hidden state, driven by collapsed/expanded mode */
  displayStars = computed(() => {
    const v = this.value();
    const isExpanded = this.expanded();
    const hover = this.hoverValue();

    return Array.from({ length: 10 }, (_, i): { fill: StarFill; hidden: boolean } => {
      const pos = i + 1;

      if (isExpanded) {
        const target = hover ?? v;
        return { fill: target >= pos ? 'full' : 'empty', hidden: false };
      }

      // Collapsed: stars 6-10 hidden, stars 1-5 use half-star mapping
      if (pos > 5) return { fill: 'empty', hidden: true };
      const threshold = pos * 2;
      if (v >= threshold) return { fill: 'full', hidden: false };
      if (v >= threshold - 1) return { fill: 'half', hidden: false };
      return { fill: 'empty', hidden: false };
    });
  });

  starArray() {
    return Array.from({ length: this.stars() }, (_, i) => i + 1);
  }

  rate(star: number) {
    this.value.set(this.value() === star ? 0 : star);
  }

  onEnter() {
    if (this.expandable()) {
      this.expanded.set(true);
    }
  }

  onLeave() {
    if (this.expandable()) {
      this.expanded.set(false);
      this.hoverValue.set(null);
    }
  }

  onStarEnter(pos: number) {
    if (this.expanded()) {
      this.hoverValue.set(pos);
    }
  }

  onStarClick(pos: number) {
    if (this.expanded()) {
      this.value.set(this.value() === pos ? 0 : pos);
      this.expanded.set(false);
      this.hoverValue.set(null);
    } else {
      this.expanded.set(true);
    }
  }

  expand() {
    this.expanded.set(true);
  }
}
