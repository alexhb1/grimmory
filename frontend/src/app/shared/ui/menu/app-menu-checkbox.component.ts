import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { LucideCheck, LucideMinus } from '@lucide/angular';

import { AppMenuComponent } from './app-menu.component';
import { AppMenuAriaItemDirective } from './menu-aria-item.directive';
import {
  checkIndicatorClass,
  checkIndicatorIconClass,
} from '../checkbox/check-indicator.styles';
import {
  appMenuItemRowClass,
  appMenuLabelClass,
  appMenuLeadingSlotClass,
  appMenuShortcutClass,
} from './menu.styles';

@Component({
  selector: 'app-menu-checkbox',
  standalone: true,
  imports: [LucideCheck, LucideMinus],
  hostDirectives: [{ directive: AppMenuAriaItemDirective, inputs: ['disabled'] }],
  host: {
    '[class]': 'rowClass',
    '[attr.role]': "'menuitemcheckbox'",
    '[attr.aria-checked]': "mixed() ? 'mixed' : checked()",
    '(click)': 'onEvent($event)',
    '(keydown)': 'onEvent($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="leadingSlotClass">
      <span [class]="boxClass()" aria-hidden="true">
        @if (mixed()) {
          <svg lucideMinus [class]="checkClass" aria-hidden="true"></svg>
        } @else if (checked()) {
          <svg lucideCheck [class]="checkClass" aria-hidden="true"></svg>
        }
      </span>
    </span>
    <span [class]="labelClass"><ng-content /></span>
    @if (shortcut()) {
      <span [class]="shortcutClass" aria-hidden="true">{{ shortcut() }}</span>
    }
  `,
})
export class AppMenuCheckboxComponent {
  readonly checked = model(false);
  readonly mixed = input(false, { transform: booleanAttribute });
  readonly shortcut = input('');
  readonly closeOnSelect = input(false, { transform: booleanAttribute });
  readonly searchLabel = input('');

  readonly selected = output<boolean>();

  private readonly menuItem = inject(AppMenuAriaItemDirective);
  private readonly owner = inject(AppMenuComponent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly rowClass = appMenuItemRowClass('default');
  protected readonly leadingSlotClass = appMenuLeadingSlotClass;
  protected readonly checkClass = checkIndicatorIconClass;
  protected readonly labelClass = appMenuLabelClass;
  protected readonly shortcutClass = appMenuShortcutClass;
  protected readonly boxClass = computed(() => checkIndicatorClass(this.checked() || this.mixed()));

  constructor() {
    this.menuItem.appOwner = this.owner;

    afterRenderEffect(() => {
      const text = this.searchLabel().trim() || (this.host.nativeElement.textContent ?? '').trim();
      this.menuItem.searchTerm.set(text);
    });
  }

  protected onEvent(event: Event): void {
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    event.stopPropagation();
    event.preventDefault();
    if (this.menuItem.disabled()) return;
    this.toggle();
  }

  private toggle(): void {
    const next = !this.checked();
    this.checked.set(next);
    this.selected.emit(next);
    if (this.closeOnSelect()) this.owner.closeChain();
  }
}
