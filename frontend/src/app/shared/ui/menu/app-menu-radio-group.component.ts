import { ChangeDetectionStrategy, Component, InjectionToken, input, model, output } from '@angular/core';

export interface AppMenuRadioGroup<T> {
  isSelected(value: T): boolean;
  select(value: T): void;
}

export const APP_MENU_RADIO_GROUP = new InjectionToken<AppMenuRadioGroup<unknown>>('APP_MENU_RADIO_GROUP');

@Component({
  selector: 'app-menu-radio-group',
  standalone: true,
  host: { role: 'group', class: 'contents' },
  providers: [{ provide: APP_MENU_RADIO_GROUP, useExisting: AppMenuRadioGroupComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
})
export class AppMenuRadioGroupComponent<T> implements AppMenuRadioGroup<T> {
  readonly value = model<T | null>(null);
  readonly ariaLabel = input('');

  readonly valueSelected = output<T>();

  isSelected(candidate: T): boolean {
    return Object.is(this.value(), candidate);
  }

  select(candidate: T): void {
    this.value.set(candidate);
    this.valueSelected.emit(candidate);
  }
}
