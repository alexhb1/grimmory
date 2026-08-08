import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface StatsChartLegendItem {
  readonly id?: string;
  readonly label: string;
  readonly color: string;
  readonly value?: string;
}

@Component({
  selector: 'app-stats-chart-legend',
  standalone: true,
  template: `
    <ul [class]="listClass()">
      @for (item of items(); track item.id ?? item.label) {
        <li [class]="itemClass()">
          <svg class="size-2.5 shrink-0" viewBox="0 0 10 10" aria-hidden="true">
            <circle cx="5" cy="5" r="5" [attr.fill]="item.color"></circle>
          </svg>
          <span [class]="labelClass()" [title]="stacked() ? item.label : null">
            {{ item.label }}
          </span>
          @if (item.value; as value) {
            <span
              class="shrink-0 font-medium tabular-nums text-text-strong"
              [class.pl-5]="stacked()">{{ value }}</span>
          }
        </li>
      }
    </ul>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsChartLegendComponent {
  readonly items = input.required<readonly StatsChartLegendItem[]>();
  readonly stacked = input(false);
  readonly styleClass = input('');

  protected readonly listClass = computed(() => this.stacked()
    ? `min-w-0 space-y-1.5 text-xs text-text-secondary ${this.styleClass()}`
    : `flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 text-xs text-text-secondary ${this.styleClass()}`,
  );
  protected readonly itemClass = computed(() => this.stacked()
    ? 'flex min-w-0 items-center gap-2'
    : 'flex items-center gap-1.5',
  );
  protected readonly labelClass = computed(() => this.stacked() ? 'min-w-0 flex-1 truncate' : '');
}
