import {Component, input, ViewChild} from '@angular/core';
import {RouterLink, RouterLinkActive} from '@angular/router';
import {MenuItem} from 'primeng/api';
import {Menu} from 'primeng/menu';

@Component({
  selector: 'app-nav-item',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, Menu],
  template: `
    <div
      class="group relative"
      (mouseenter)="hovered = true"
      (mouseleave)="hovered = false"
    >
      @if (active() !== undefined) {
        <a
          [routerLink]="href()"
          class="flex items-center gap-3 px-3 py-[7px] rounded-[6px] text-sm transition-all duration-150"
          [class.bg-walnut-lighter]="active()"
          [class.text-white]="active()"
          [class.font-medium]="active()"
          [class.text-walnut-text]="!active()"
          [class.hover:bg-walnut-light]="!active()"
          [class.hover:text-white]="!active()"
        >
          <span class="flex-1 truncate">{{ label() }}</span>
          <span class="text-xs tabular-nums min-w-0 text-right">
            @if (menu().length > 0 && hovered) {
              <button
                (click)="openMenu($event)"
                class="text-walnut-text-muted hover:text-white transition-colors cursor-pointer p-0 leading-none"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
              </button>
            } @else if (count() !== undefined) {
              <span class="text-walnut-text-muted">{{ count() }}</span>
            }
          </span>
        </a>
      } @else {
        <a
          [routerLink]="href()"
          routerLinkActive="bg-walnut-lighter text-white font-medium"
          [routerLinkActiveOptions]="{ exact: exact() }"
          class="flex items-center gap-3 px-3 py-[7px] rounded-[6px] text-sm transition-all duration-150 text-walnut-text hover:bg-walnut-light hover:text-white"
        >
          <span class="flex-1 truncate">{{ label() }}</span>
          <span class="text-xs tabular-nums min-w-0 text-right">
            @if (menu().length > 0 && hovered) {
              <button
                (click)="openMenu($event)"
                class="text-walnut-text-muted hover:text-white transition-colors cursor-pointer p-0 leading-none"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
              </button>
            } @else if (count() !== undefined) {
              <span class="text-walnut-text-muted">{{ count() }}</span>
            }
          </span>
        </a>
      }
      <p-menu #entityMenu [model]="menu()" [popup]="true" appendTo="body" />
    </div>
  `,
})
export class NavItemComponent {
  label = input.required<string>();
  href = input<string>('#');
  count = input<number>();
  active = input<boolean>();
  exact = input<boolean>(true);
  menu = input<MenuItem[]>([]);

  @ViewChild('entityMenu') entityMenu!: Menu;
  hovered = false;

  openMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.entityMenu.toggle(event);
  }
}
