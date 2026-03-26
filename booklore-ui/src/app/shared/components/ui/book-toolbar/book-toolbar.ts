import { Component, DestroyRef, ElementRef, afterNextRender, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-book-toolbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div
      class="sticky top-0 z-10 -mx-8 bg-surface py-4 transition-shadow duration-200"
      [class.shadow-paper-lifted]="stuck()"
    >
      <div class="mx-auto flex w-full max-w-[1164px] items-center justify-between gap-4 px-8">
        <button
          (click)="goBack()"
          class="inline-flex items-center gap-1.5 rounded-[4px] text-sm text-ink-muted transition-colors cursor-pointer hover:text-ink border-none bg-transparent p-0"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          {{ backLabel() }}
        </button>

        @if (total()) {
          <div class="flex items-center gap-2">
            <button
              class="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-ink-muted transition-colors cursor-pointer hover:bg-surface-hover hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/30"
              aria-label="Previous book"
              [disabled]="!prev()"
              [routerLink]="prev() ? ['/book', prev()] : null"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m15 18-6-6 6-6"/>
              </svg>
            </button>

            <span class="text-xs text-ink-muted tabular-nums">{{ current() }} of {{ total() }}</span>

            <button
              class="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-ink-muted transition-colors cursor-pointer hover:bg-surface-hover hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/30"
              aria-label="Next book"
              [disabled]="!next()"
              [routerLink]="next() ? ['/book', next()] : null"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class BookToolbarComponent {
  backLabel = input('Back');
  current = input<number>(0);
  total = input<number>(0);
  prev = input<number | null>(null);
  next = input<number | null>(null);

  private location = inject(Location);
  private router = inject(Router);
  private host = inject(ElementRef<HTMLElement>);
  private destroyRef = inject(DestroyRef);
  stuck = signal(false);

  goBack() {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/all-books']);
    }
  }

  constructor() {
    afterNextRender(() => {
      const scrollContainer = this.host.nativeElement.closest('main');
      if (!(scrollContainer instanceof HTMLElement)) {
        this.stuck.set(false);
        return;
      }

      const shadowThreshold = 24;

      const updateStuck = () => {
        this.stuck.set(scrollContainer.scrollTop >= shadowThreshold);
      };

      updateStuck();
      scrollContainer.addEventListener('scroll', updateStuck, { passive: true });
      this.destroyRef.onDestroy(() => {
        scrollContainer.removeEventListener('scroll', updateStuck);
      });
    });
  }
}
