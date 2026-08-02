import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-stats-circular-chart-layout',
  standalone: true,
  template: `
    <div
      class="stats-circular-query"
      [style.--stats-circular-plot-size]="plotHeight() + 'px'">
      <div class="stats-circular-layout">
        <div
          class="w-full"
          [style.height.px]="plotHeight()"
          [style.maxWidth.px]="plotHeight()">
          <ng-content select="[statsCircularChartPlot]" />
        </div>

        <div
          class="w-45 max-w-full overflow-y-auto pr-1"
          [style.maxHeight.px]="plotHeight()">
          <ng-content select="[statsCircularChartLegend]" />
        </div>
      </div>
    </div>
  `,
  styleUrl: './stats-circular-chart-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 flex-1' },
})
export class StatsCircularChartLayoutComponent {
  readonly plotHeight = input(240);
}
