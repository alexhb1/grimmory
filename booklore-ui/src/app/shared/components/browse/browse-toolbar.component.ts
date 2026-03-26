import {Component, DestroyRef, ElementRef, afterNextRender, inject, input, model, output, signal, viewChild} from '@angular/core';

export type ViewMode = 'grid' | 'table';

@Component({
  selector: 'app-browse-toolbar',
  standalone: true,
  template: `
    <div #sentinel class="h-0"></div>

    <div
      class="sticky top-0 z-10 bg-surface py-4 -mx-8 px-8"
      [class.shadow-paper-lifted]="stuck()"
    >
      <div class="flex items-center gap-2.5">
        <!-- View toggle -->
        @if (showViewToggle()) {
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
        }

        <ng-content select="[toolbarStart]" />

        <div class="flex-1"></div>

        <!-- Search -->
        <div class="relative max-w-xs w-full">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            [placeholder]="searchPlaceholder()"
            [value]="searchTerm()"
            (input)="onSearchInput($event)"
            class="w-full h-8 pl-8 pr-3 bg-surface-raised shadow-paper rounded-[6px] text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
          />
          @if (searchTerm()) {
            <button
              (click)="clearSearch()"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          }
        </div>

        <ng-content select="[toolbarEnd]" />
      </div>
    </div>
  `,
})
export class BrowseToolbarComponent {
  searchPlaceholder = input('Search...');
  showViewToggle = input(true);
  searchTerm = model('');
  viewMode = model<ViewMode>('grid');
  searchTermChange = output<string>();

  stuck = signal(false);
  private sentinel = viewChild.required<ElementRef<HTMLElement>>('sentinel');
  private destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      setTimeout(() => {
        const el = this.sentinel().nativeElement;
        const scrollContainer = this.findScrollParent(el);
        if (!scrollContainer) return;

        const check = () => {
          this.stuck.set(el.getBoundingClientRect().top < scrollContainer.getBoundingClientRect().top);
        };

        scrollContainer.addEventListener('scroll', check, {passive: true});
        this.destroyRef.onDestroy(() => scrollContainer.removeEventListener('scroll', check));
      });
    });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    this.searchTermChange.emit(value);
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.searchTermChange.emit('');
  }

  private findScrollParent(el: HTMLElement): HTMLElement | null {
    let node = el.parentElement;
    while (node) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return node;
      node = node.parentElement;
    }
    return null;
  }
}
