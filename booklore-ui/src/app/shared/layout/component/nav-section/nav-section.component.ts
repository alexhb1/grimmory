import { Component, input } from '@angular/core';

@Component({
  selector: 'app-nav-section',
  standalone: true,
  template: `
    <div class="mb-5">
      @if (title()) {
        <div class="px-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-walnut-text-muted">
          {{ title() }}
        </div>
      }
      <div class="flex flex-col gap-px">
        <ng-content />
      </div>
    </div>
  `,
})
export class NavSectionComponent {
  title = input<string>();
}
