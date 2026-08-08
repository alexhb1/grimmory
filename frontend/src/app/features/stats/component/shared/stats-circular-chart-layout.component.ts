import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-stats-circular-chart-layout',
  standalone: true,
  template: `
    <div
      class="
        h-full min-h-(--stats-circular-plot-size) min-w-0 [container:stats-circular/size]
        [@container(width<21.75rem)]:min-h-[30.75rem]
      "
      [style.--stats-circular-plot-size]="plotHeight() + 'px'">
      <div
        class="
          grid h-full min-w-0 grid-cols-[minmax(8rem,var(--stats-circular-plot-size))_11.25rem]
          grid-rows-[var(--stats-circular-plot-size)] place-content-center place-items-center gap-x-4
          gap-y-3
          [@container_stats-circular_(height>=30.75rem)]:grid-cols-[minmax(0,var(--stats-circular-plot-size))]
          [@container_stats-circular_(height>=30.75rem)]:grid-rows-[var(--stats-circular-plot-size)_auto]
        ">
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 flex-1' },
})
export class StatsCircularChartLayoutComponent {
  readonly plotHeight = input(240);
}
