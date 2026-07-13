import {ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild} from '@angular/core';
import {Menu} from '@angular/aria/menu';
import {TranslocoPipe} from '@jsverse/transloco';

import {LucideSearch} from '@lucide/angular';

import {cn} from '../../ui/cn';
import {AppMenuComponent} from '../../ui/menu/app-menu.component';
import {AppMenuCheckboxComponent} from '../../ui/menu/app-menu-checkbox.component';
import {AppMenuItemComponent} from '../../ui/menu/app-menu-item.component';
import {AppMenuSeparatorComponent} from '../../ui/menu/app-menu-separator.component';

export interface ShelfMembershipItem {
  id: number;
  name: string;
  checked: boolean;
  mixed?: boolean;
}

const FILTER_THRESHOLD = 8;

@Component({
  selector: 'app-shelf-membership-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {class: 'contents'},
  imports: [
    TranslocoPipe,
    LucideSearch,
    AppMenuComponent,
    AppMenuCheckboxComponent,
    AppMenuItemComponent,
    AppMenuSeparatorComponent,
  ],
  template: `
    <app-menu
      [ariaLabel]="'cards.menu.addToShelf' | transloco"
      (opened)="onOpened()"
      (closed)="onClosed()"
    >
      @if (filterVisible()) {
        <div [class]="filterBlockClass()">
          <div [class]="filterRowClass()">
            <svg lucideSearch class="size-3.5 shrink-0 text-text-muted" aria-hidden="true"></svg>
            <input
              #filterInput
              type="text"
              class="w-full min-w-0 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
              [value]="query()"
              [placeholder]="'shared.ui.select.search' | transloco"
              [attr.aria-label]="'shared.ui.select.search' | transloco"
              (input)="onQueryInput($event)"
              (keydown)="onFilterKeydown($event)"
            />
          </div>
          <app-menu-separator />
        </div>
      }
      <div class="max-h-80 overflow-y-auto overscroll-contain">
        @for (shelf of filteredShelves(); track shelf.id) {
          <app-menu-checkbox
            [checked]="shelf.checked"
            [mixed]="shelf.mixed ?? false"
            (selected)="toggleShelf.emit({shelfId: shelf.id, checked: $event})">{{ shelf.name }}</app-menu-checkbox>
        } @empty {
          @if (shelves().length > 0) {
            <p class="m-0 flex min-h-7 items-center px-2 py-1 text-sm leading-5 text-text-muted pointer-coarse:min-h-11 pointer-coarse:px-3">{{ 'shared.ui.select.noResults' | transloco }}</p>
          }
        }
      </div>
      <div [class]="footerBlockClass()">
        @if (shelves().length > 0) {
          <app-menu-separator />
        }
        <app-menu-item (selected)="createShelf.emit()">{{ 'cards.menu.newShelf' | transloco }}</app-menu-item>
      </div>
    </app-menu>
  `,
})
export class ShelfMembershipMenuComponent {
  readonly shelves = input.required<ShelfMembershipItem[]>();

  readonly toggleShelf = output<{shelfId: number; checked: boolean}>();
  readonly createShelf = output<void>();

  readonly menu = viewChild.required(AppMenuComponent);
  readonly ariaMenu = viewChild.required(AppMenuComponent, {read: Menu});

  private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');

  protected readonly query = signal('');
  protected readonly filterVisible = computed(() => this.shelves().length > FILTER_THRESHOLD);
  private readonly menuRef = viewChild(AppMenuComponent);

  protected readonly filterBlockClass = computed(() =>
    cn('flex flex-col', this.menuRef()?.opensUpward() && 'order-last flex-col-reverse'),
  );
  protected readonly footerBlockClass = computed(() =>
    cn('flex flex-col', this.menuRef()?.opensUpward() && 'order-first flex-col-reverse'),
  );
  protected readonly filterRowClass = computed(() =>
    cn(
      'flex items-center gap-2 px-2',
      this.menuRef()?.opensUpward() ? 'pb-1.5 pt-2' : 'pb-2 pt-1.5',
    ),
  );
  protected readonly filteredShelves = computed(() => {
    const needle = this.query().trim().toLowerCase();
    if (!needle) {
      return this.shelves();
    }
    return this.shelves().filter(shelf => shelf.name.toLowerCase().includes(needle));
  });

  protected onOpened(): void {
    queueMicrotask(() => this.filterInput()?.nativeElement.focus({preventScroll: true}));
  }

  protected onClosed(): void {
    this.query.set('');
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onFilterKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Tab') {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
  }
}
