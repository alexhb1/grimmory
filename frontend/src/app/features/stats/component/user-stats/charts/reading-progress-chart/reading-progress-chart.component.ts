import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import {
  type ReadingProgressBandId,
  type ReadingProgressStats,
} from '../../../../data/user/reading-progress-stats';

type ReadingProgressChartData = ChartData<'doughnut', number[], string>;
type ReadingProgressBand = ReadingProgressStats['bands'][number];

const CHART_FONT_FAMILY = "'Inter', sans-serif";

const BAND_COLORS: Readonly<Record<ReadingProgressBandId, string>> = {
  'not-started': '#6c757d',
  'just-started': '#ffc107',
  'getting-into-it': '#fd7e14',
  'halfway-through': '#17a2b8',
  'almost-finished': '#6f42c1',
  completed: '#28a745',
};

const BAND_LABELS: Readonly<Record<ReadingProgressBandId, string>> = {
  'not-started': '0%',
  'just-started': '1-25%',
  'getting-into-it': '26-50%',
  'halfway-through': '51-75%',
  'almost-finished': '76-99%',
  completed: '100%',
};

const BAND_LABEL_KEYS: Readonly<Record<ReadingProgressBandId, string>> = {
  'not-started': 'notStarted',
  'just-started': 'justStarted',
  'getting-into-it': 'gettingIntoIt',
  'halfway-through': 'halfwayThrough',
  'almost-finished': 'almostFinished',
  completed: 'completed',
};

@Component({
  selector: 'app-reading-progress-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './reading-progress-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadingProgressChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<ReadingProgressStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'doughnut' as const;
  readonly bands = computed<readonly ReadingProgressBand[]>(() => this.stats().bands);
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });
  readonly emptyMessage = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.bookFlow.noData');
  });
  readonly chartData = computed<ReadingProgressChartData>(() => {
    this.activeLanguage();
    const bands = this.bands();

    return {
      labels: bands.map((band) => BAND_LABELS[band.id]),
      datasets: [
        {
          label: this.transloco.translate('statsUser.readingProgress.booksByProgress'),
          data: bands.map((band) => band.bookCount),
          backgroundColor: bands.map((band) => BAND_COLORS[band.id]),
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'doughnut'>['options']>(() => {
    const bands = this.bands();
    const totalBooks = this.stats().totalBooks;

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 15 } },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            font: { family: CHART_FONT_FAMILY, size: 12 },
            padding: 15,
            usePointStyle: true,
            pointStyle: 'circle',
            generateLabels: (chart) => {
              const data = chart.data;
              if (!data.labels?.length || !data.datasets.length) return [];

              return data.labels.map((label, index) => ({
                text: `${label}: ${data.datasets[0].data[index] as number}`,
                fillStyle: (data.datasets[0].backgroundColor as string[])[index],
                lineWidth: 1,
                hidden: !chart.getDataVisibility(index),
                index,
              }));
            },
          },
        },
        tooltip: {
          enabled: true,
          borderWidth: 1,
          cornerRadius: 6,
          displayColors: true,
          padding: 12,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          callbacks: {
            title: (context) => context[0]?.label ?? '',
            label: (context) => {
              const band = bands.at(context.dataIndex);
              if (!band || totalBooks === 0) return '';

              return this.transloco.translate('statsUser.readingProgress.tooltipLabel', {
                value: band.bookCount,
                plural: band.bookCount === 1 ? '' : 's',
                description: this.bandDescription(band.id),
                percentage: ((band.bookCount / totalBooks) * 100).toFixed(1),
              });
            },
          },
        },
      },
      interaction: { intersect: false, mode: 'point' },
    };
  });

  private bandDescription(id: ReadingProgressBandId): string {
    this.activeLanguage();
    return this.transloco.translate(`statsUser.readingProgress.${BAND_LABEL_KEYS[id]}`);
  }
}
