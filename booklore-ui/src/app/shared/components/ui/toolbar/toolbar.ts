import { Component, ElementRef, input, model, signal, viewChild, afterNextRender } from '@angular/core';
import { ButtonComponent } from '../button/button';
import { SliderComponent } from '../slider/slider';
import { PopoverComponent } from '../popover/popover';

export type ViewMode = 'grid' | 'table';

const GRID_SCALE_KEY = 'gridScale';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [ButtonComponent, SliderComponent, PopoverComponent],
  template: `
    <div class="mb-8">
      <h1 class="font-heading text-3xl font-semibold text-ink tracking-tight">{{ libraryName() }}</h1>
      <p class="text-sm text-ink-muted mt-1">{{ bookCount() }} books in library</p>
    </div>

    <div #sentinel class="h-0"></div>

    <div
      class="sticky top-0 z-10 bg-surface py-4 -mx-8 px-8 transition-shadow duration-200"
      [class.shadow-paper-lifted]="stuck()"
    >
      <div class="flex items-center gap-2.5">
        <app-button variant="secondary">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          Filters
        </app-button>

        <app-button variant="secondary">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>
          </svg>
          Title A&ndash;Z
        </app-button>

        <div class="flex-1">
          <div class="relative max-w-xs">
            <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              type="text"
              [placeholder]="'Search ' + libraryName() + '...'"
              class="w-full h-8 pl-8 pr-3 bg-surface-raised shadow-paper rounded-[6px] text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
            />
          </div>
        </div>

        @if (viewMode() === 'grid') {
          <app-popover #scalePopover align="end">
            <app-button popoverTrigger variant="secondary" (click)="scalePopover.toggle()" title="Cover size">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </app-button>
            <div class="flex items-center gap-3" style="width: 180px;">
              <svg class="w-3 h-3 text-ink-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
              <app-slider class="flex-1" [(value)]="gridScale" [min]="0.5" [max]="1.5" [step]="0.05" ariaLabel="Cover size" (onChange)="onScaleChange()" />
              <svg class="w-4.5 h-4.5 text-ink-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </div>
          </app-popover>
        }

        <div class="flex items-center shadow-paper rounded-[6px] overflow-hidden">
          <button
            (click)="viewMode.set('grid')"
            class="h-8 w-8 flex items-center justify-center transition-colors cursor-pointer"
            [class.bg-surface-sunken]="viewMode() === 'grid'"
            [class.text-ink-light]="viewMode() === 'grid'"
            [class.bg-surface-raised]="viewMode() !== 'grid'"
            [class.text-ink-muted]="viewMode() !== 'grid'"
            [class.hover:text-ink-light]="viewMode() !== 'grid'"
            title="Grid view"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
          </button>
          <button
            (click)="viewMode.set('table')"
            class="h-8 w-8 flex items-center justify-center transition-colors cursor-pointer"
            [class.bg-surface-sunken]="viewMode() === 'table'"
            [class.text-ink-light]="viewMode() === 'table'"
            [class.bg-surface-raised]="viewMode() !== 'table'"
            [class.text-ink-muted]="viewMode() !== 'table'"
            [class.hover:text-ink-light]="viewMode() !== 'table'"
            title="Table view"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ToolbarComponent {
  libraryName = input.required<string>();
  bookCount = input.required<number>();
  viewMode = model<ViewMode>('grid');
  gridScale = model<number>(parseFloat(localStorage.getItem(GRID_SCALE_KEY) ?? '1'));

  stuck = signal(false);
  private sentinel = viewChild.required<ElementRef<HTMLElement>>('sentinel');

  onScaleChange() {
    localStorage.setItem(GRID_SCALE_KEY, String(this.gridScale()));
  }

  constructor() {
    afterNextRender(() => {
      const scrollContainer = this.sentinel().nativeElement.closest('main');
      const observer = new IntersectionObserver(
        ([entry]) => this.stuck.set(!entry.isIntersecting),
        { threshold: 0, root: scrollContainer }
      );
      observer.observe(this.sentinel().nativeElement);
    });
  }
}
