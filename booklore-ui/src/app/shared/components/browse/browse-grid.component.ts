import {Component, computed, input} from '@angular/core';

@Component({
  selector: 'app-browse-grid',
  standalone: true,
  template: `
    <div class="grid gap-x-4 gap-y-5 pt-1" [style.grid-template-columns]="gridColumns()">
      <ng-content />
    </div>
  `,
})
export class BrowseGridComponent {
  scale = input(1);
  baseWidth = input(135);

  gridColumns = computed(() => {
    const minWidth = Math.round(this.baseWidth() * this.scale());
    return `repeat(auto-fill, minmax(${minWidth}px, 1fr))`;
  });
}
