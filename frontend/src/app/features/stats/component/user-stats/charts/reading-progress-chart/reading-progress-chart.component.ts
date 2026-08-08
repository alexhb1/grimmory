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
import { StatsCircularChartLayoutComponent } from '../../../shared/stats-circular-chart-layout.component';
import {
  type ReadingProgressBandId,
  type ReadingProgressStats,
} from '../../../../data/user/reading-progress-stats';

interface ReadingProgressLegendEntry {
  readonly id: ReadingProgressBandId;
  readonly label: string;
  readonly color: string;
  readonly bookCount: number;
}

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
  imports: [
    BaseChartDirective,
    StatsChartCardComponent,
    StatsCircularChartLayoutComponent,
    TranslocoDirective,
  ],
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
    if (this.loading()) return 'ready';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });
  readonly emptyMessage = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.bookFlow.noData');
  });
  readonly legend = computed<readonly ReadingProgressLegendEntry[]>(() =>
    this.bands().map((band) => ({
      id: band.id,
      label: band.label,
      color: BAND_COLORS[band.id],
      bookCount: band.bookCount,
    })),
  );

  readonly chartData = computed<ReadingProgressChartData>(() => {
    this.activeLanguage();
    const bands = this.bands();

    return {
      labels: bands.map((band) => band.label),
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
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderWidth: 1,
          cornerRadius: 6,
          displayColors: true,
          padding: 12,
          titleFont: { family: CHART_FONT_FAMILY, size: 14, weight: 'bold' },
          bodyFont: { family: CHART_FONT_FAMILY, size: 13 },
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

  protected formatCount(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }

  private bandDescription(id: ReadingProgressBandId): string {
    this.activeLanguage();
    return this.transloco.translate(`statsUser.readingProgress.${BAND_LABEL_KEYS[id]}`);
  }
}
