import {Component, input} from '@angular/core';
import {MenuItem} from 'primeng/api';
import {Menu} from 'primeng/menu';

@Component({
  selector: 'app-browse-page',
  standalone: true,
  imports: [Menu],
  template: `
    <div class="max-w-[1400px] mx-auto px-8 py-8">
      <!-- Header -->
      <div class="flex items-start justify-between mb-8">
        <div>
          <h1 class="font-heading text-3xl font-semibold text-ink tracking-tight">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="text-sm text-ink-muted mt-1">{{ subtitle() }}</p>
          }
        </div>
        <div class="flex items-center gap-2">
          <ng-content select="[headerActions]" />
          @if (entityMenu().length > 0) {
            <button
              (click)="entityMenuRef.toggle($event)"
              class="h-8 w-8 flex items-center justify-center rounded-[6px] text-ink-muted hover:bg-surface-hover hover:text-ink transition-all cursor-pointer"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
              </svg>
            </button>
            <p-menu #entityMenuRef [model]="entityMenu()" [popup]="true" appendTo="body" />
          }
        </div>
      </div>

      <!-- Content -->
      <ng-content />
    </div>
  `,
})
export class BrowsePageComponent {
  title = input.required<string>();
  subtitle = input<string>();
  entityMenu = input<MenuItem[]>([]);
}
