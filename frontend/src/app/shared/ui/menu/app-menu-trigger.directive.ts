import { computed, Directive, ElementRef, inject, input } from '@angular/core';

import { AppMenuComponent } from './app-menu.component';

@Directive({
  selector: '[appMenuTriggerFor]',
  standalone: true,
  host: {
    '[attr.aria-haspopup]': "'menu'",
    '[attr.aria-expanded]': 'expanded()',
    '[attr.aria-controls]': 'controls()',
    '(click)': 'toggle($event)',
    '(keydown)': 'onKeydown($event)',
  },
})
export class AppMenuTriggerForDirective {
  readonly menu = input.required<AppMenuComponent>({ alias: 'appMenuTriggerFor' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly expanded = computed(() =>
    this.menu().openerElement() === this.host.nativeElement ? 'true' : 'false',
  );
  protected readonly controls = computed(() =>
    this.expanded() === 'true' ? this.menu().menu.id() : null,
  );

  protected toggle(event: Event): void {
    event.stopPropagation();
    const menu = this.menu();
    if (menu.openerElement() === this.host.nativeElement) {
      menu.close();
    } else {
      menu.open(this.host.nativeElement);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    this.menu().open(this.host.nativeElement);
  }
}

@Directive({
  selector: '[appContextMenuFor]',
  standalone: true,
  host: { '(contextmenu)': 'onContextMenu($event)' },
})
export class AppContextMenuForDirective {
  readonly menu = input.required<AppMenuComponent>({ alias: 'appContextMenuFor' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.menu().openAt(event.clientX, event.clientY, this.host.nativeElement);
  }
}
