import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface StatsChartSummaryItem {
  readonly label: string;
  readonly value: string | number;
  readonly detail?: string;
  readonly valueTitle?: string;
  readonly detailTitle?: string;
  readonly truncateValue?: boolean;
  readonly truncateDetail?: boolean;
}

@Component({
  selector: 'app-stats-chart-summary',
  standalone: true,
  template: `
    <dl [class]="gridClass()">
      @for (item of items(); track item.label) {
        <div class="min-w-0">
          <dt class="text-xs font-medium text-text-secondary">{{ item.label }}</dt>
          <dd
            class="mt-1 text-lg font-semibold tabular-nums text-text-strong"
            [class.truncate]="item.truncateValue"
            [attr.title]="item.valueTitle ?? (item.truncateValue ? item.value : null)">
            {{ item.value }}
          </dd>
          @if (item.detail; as detail) {
            <dd
              class="text-xs tabular-nums text-text-muted"
              [class.truncate]="item.truncateDetail"
              [title]="item.detailTitle ?? null">
              {{ detail }}
            </dd>
          }
        </div>
      }
    </dl>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsChartSummaryComponent {
  readonly items = input.required<readonly StatsChartSummaryItem[]>();
  readonly containerColumns = input(false);

  protected readonly gridClass = computed(() =>
    `grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border pt-4 ${
      this.containerColumns() ? '@2xl:grid-cols-4' : 'sm:grid-cols-4'
    }`,
  );
}
