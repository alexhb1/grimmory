import {Component, output} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';

export type GridDensityDirection = 'smaller' | 'larger';

@Component({
  selector: 'app-grid-density-buttons',
  standalone: true,
  imports: [TranslocoPipe],
  template: `
    <div
      class="browser-grid-options"
      role="group"
      [attr.aria-label]="'common.cardSizeControls' | transloco">
      <button
        type="button"
        class="browser-grid-option-btn"
        [attr.aria-label]="'common.decreaseCardSize' | transloco"
        [title]="'common.decreaseCardSize' | transloco"
        (click)="densityChange.emit('smaller')">−</button>
      <button
        type="button"
        class="browser-grid-option-btn"
        [attr.aria-label]="'common.increaseCardSize' | transloco"
        [title]="'common.increaseCardSize' | transloco"
        (click)="densityChange.emit('larger')">+</button>
    </div>
  `,
})
export class GridDensityButtonsComponent {
  readonly densityChange = output<GridDensityDirection>();
}
