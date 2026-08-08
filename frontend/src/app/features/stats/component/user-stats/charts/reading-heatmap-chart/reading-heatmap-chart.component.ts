import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Chart, type ChartConfiguration, type ChartData } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { BaseChartDirective } from 'ng2-charts';

import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { readStatsChartThemeColors } from '../../../shared/stats-chart-theme.service';
import { type ReadingHeatmapStats } from '../../../../data/user/reading-heatmap-stats';

interface HeatmapPoint {
  readonly x: number;
  readonly y: number;
  readonly v: number;
}

const MONTHS_PER_YEAR = 12;

Chart.register(MatrixController, MatrixElement);

@Component({
  selector: 'app-reading-heatmap-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './reading-heatmap-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadingHeatmapChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<ReadingHeatmapStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'matrix' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });

  private readonly monthLabels = computed(() => {
    const locale = this.activeLanguage();
    return Array.from({ length: MONTHS_PER_YEAR }, (_, month) =>
      new Date(2000, month, 1).toLocaleDateString(locale, { month: 'short' }),
    );
  });

  readonly chartData = computed<ChartData<'matrix', HeatmapPoint[], string>>(() => {
    const { cells, maximumBookCount, years } = this.stats();

    return {
      labels: [],
      datasets: [
        {
          label: this.transloco.translate('statsUser.readingHeatmap.booksRead'),
          data: cells.map((cell) => ({
            x: cell.monthIndex,
            y: cell.yearIndex,
            v: cell.bookCount,
          })),
          backgroundColor: (context) => {
            const point = context.raw as HeatmapPoint | undefined;
            if (!point?.v) return readStatsChartThemeColors().grid;

            const intensity = point.v / maximumBookCount;
            return `rgba(239, 71, 111, ${Math.max(0.2, Math.min(1, intensity * 0.8 + 0.2))})`;
          },
          borderWidth: 1,
          width: ({ chart }) => chart.chartArea.width / MONTHS_PER_YEAR - 1,
          height: ({ chart }) => chart.chartArea.height / years.length - 1,
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'matrix'>['options']>(() => {
    const months = this.monthLabels();
    const years = this.stats().years;

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderColor: '#ef476f',
          borderWidth: 2,
          cornerRadius: 8,
          displayColors: false,
          padding: 16,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          callbacks: {
            title: (context) => {
              const point = context[0]?.raw as HeatmapPoint | undefined;
              if (!point) return '';

              return `${months[point.x]} ${years[point.y]}`;
            },
            label: (context) => {
              const point = context.raw as HeatmapPoint | undefined;
              return this.transloco.translate(
                point?.v === 1
                  ? 'statsUser.readingHeatmap.tooltipBook'
                  : 'statsUser.readingHeatmap.tooltipBooks',
                { value: point?.v ?? 0 },
              );
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          ticks: {
            stepSize: 1,
            callback: (value) => months[value as number] ?? '',
            font: { family: "'Inter', sans-serif", size: 11 },
          },
          grid: { display: false },
        },
        y: {
          type: 'linear',
          offset: true,
          max: years.length - 1,
          ticks: {
            stepSize: 1,
            callback: (value) => years[value as number] ?? '',
            font: { family: "'Inter', sans-serif", size: 11 },
          },
          grid: { display: false },
        },
      },
    };
  });
}
