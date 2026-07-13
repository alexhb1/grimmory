import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucideDynamicIcon, LucideLoaderCircle, type LucideIconData } from '@lucide/angular';

import { cn } from '../cn';
import { injectMobileShell } from '../mobile-shell';
import { AppMenuComponent } from './app-menu.component';
import { AppMenuAriaItemDirective } from './menu-aria-item.directive';
import {
  appMenuIconClass,
  appMenuItemRowClass,
  appMenuLabelClass,
  appMenuLeadingSlotClass,
  appMenuShortcutClass,
  appMenuSpinnerClass,
  appMenuSubmenuIconClass,
  type AppMenuItemVariant,
} from './menu.styles';

@Component({
  selector: 'app-menu-item',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, LucideDynamicIcon, LucideChevronRight, LucideLoaderCircle],
  hostDirectives: [{ directive: AppMenuAriaItemDirective, inputs: ['disabled', 'submenu'] }],
  host: {
    '[class]': 'rowClass()',
    '(click)': 'onClick($event)',
    '(keydown)': 'onKeydown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (link() !== null) {
      <a
        #anchor
        [routerLink]="link()"
        [queryParams]="queryParams()"
        tabindex="-1"
        class="flex min-h-full w-full items-center gap-2 no-underline text-inherit outline-none">
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <ng-container [ngTemplateOutlet]="body" />
    }

    <ng-template #body>
      @if (loading()) {
        <span [class]="leadingSlotClass">
          <svg lucideLoaderCircle [class]="spinnerClass" aria-hidden="true"></svg>
        </span>
      } @else if (icon(); as iconData) {
        <span [class]="leadingSlotClass">
          <svg [lucideIcon]="iconData" [class]="iconClass" aria-hidden="true"></svg>
        </span>
      } @else if (inset()) {
        <span [class]="leadingSlotClass" aria-hidden="true"></span>
      }

      <span [class]="labelClass"><ng-content /></span>

      @if (shortcut()) {
        <span [class]="shortcutClass" aria-hidden="true">{{ shortcut() }}</span>
      }
      @if (menuItem.hasPopup()) {
        <svg lucideChevronRight [class]="submenuIconClass()" aria-hidden="true"></svg>
      }
    </ng-template>
  `,
})
export class AppMenuItemComponent {
  readonly icon = input<LucideIconData | undefined>(undefined);
  readonly loading = input(false, { transform: booleanAttribute });
  readonly inset = input(false, { transform: booleanAttribute });
  readonly shortcut = input('');
  readonly variant = input<AppMenuItemVariant>('default');
  readonly closeOnSelect = input(true, { transform: booleanAttribute });
  readonly link = input<string | readonly unknown[] | null>(null);
  readonly queryParams = input<Record<string, unknown> | null>(null);
  readonly searchLabel = input('');

  readonly selected = output<void>();

  protected readonly menuItem = inject(AppMenuAriaItemDirective);
  private readonly owner = inject(AppMenuComponent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly anchor = viewChild<ElementRef<HTMLAnchorElement>>('anchor');
  private suppressClick = false;

  protected readonly leadingSlotClass = appMenuLeadingSlotClass;
  protected readonly iconClass = appMenuIconClass;
  protected readonly spinnerClass = `${appMenuSpinnerClass} animate-spin`;
  protected readonly labelClass = appMenuLabelClass;
  protected readonly shortcutClass = appMenuShortcutClass;
  private readonly mobileShell = injectMobileShell();
  protected readonly submenuIconClass = computed(() =>
    cn(appMenuSubmenuIconClass, this.mobileShell() && this.menuItem.expanded() && 'rotate-90'),
  );
  protected readonly rowClass = computed(() => appMenuItemRowClass(this.variant()));

  constructor() {
    this.menuItem.appOwner = this.owner;

    inject(DestroyRef).onDestroy(() => {
      const submenu = this.menuItem.submenu();
      if (submenu && submenu.parent() === this.menuItem) {
        submenu.parent.set(undefined);
      }
    });

    afterRenderEffect(() => {
      const explicit = this.searchLabel().trim();
      const text = explicit || (this.host.nativeElement.textContent ?? '').trim();
      this.menuItem.searchTerm.set(text);
    });
  }

  protected onClick(event: MouseEvent): void {
    if (this.menuItem.hasPopup()) {
      if (this.mobileShell() && this.menuItem.expanded()) {
        event.stopPropagation();
        this.menuItem.close();
      }
      return;
    }
    event.stopPropagation();
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (this.isInert()) {
      event.preventDefault();
      return;
    }
    this.activate();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (this.menuItem.hasPopup()) return;
    event.stopPropagation();
    event.preventDefault();
    if (this.isInert()) return;
    if (this.link() !== null) {
      this.suppressClick = true;
      this.anchor()?.nativeElement.click();
    }
    this.activate();
  }

  private activate(): void {
    this.selected.emit();
    if (this.closeOnSelect()) this.owner.closeChain();
  }

  private isInert(): boolean {
    return this.loading() || this.menuItem.disabled();
  }
}
