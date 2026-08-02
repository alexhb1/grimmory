import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { ReadStatus } from '../../../../../book/model/book.model';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { StatsCircularChartLayoutComponent } from '../../../shared/stats-circular-chart-layout.component';
import { type ReadStatusSlice, type ReadStatusStats } from '../../../../data/user/read-status-stats';

interface ReadStatusLegendEntry {
  readonly status: ReadStatus;
  readonly label: string;
  readonly color: string;
  readonly bookCount: number;
}

type ReadStatusChartData = ChartData<'doughnut', number[], string>;

const CHART_FONT_FAMILY = "'Inter', sans-serif";

const STATUS_COLORS: Readonly<Record<ReadStatus, string>> = {
  [ReadStatus.UNREAD]: '#6c757d',
  [ReadStatus.READING]: '#17a2b8',
  [ReadStatus.RE_READING]: '#6f42c1',
  [ReadStatus.READ]: '#28a745',
  [ReadStatus.PARTIALLY_READ]: '#ffc107',
  [ReadStatus.PAUSED]: '#fd7e14',
  [ReadStatus.WONT_READ]: '#dc3545',
  [ReadStatus.ABANDONED]: '#e74c3c',
  [ReadStatus.UNSET]: '#343a40',
};

const STATUS_LABEL_KEYS: Readonly<Record<ReadStatus, string>> = {
  [ReadStatus.UNREAD]: 'unread',
  [ReadStatus.READING]: 'currentlyReading',
  [ReadStatus.RE_READING]: 'reReading',
  [ReadStatus.READ]: 'read',
  [ReadStatus.PARTIALLY_READ]: 'partiallyRead',
  [ReadStatus.PAUSED]: 'paused',
  [ReadStatus.WONT_READ]: 'wontRead',
  [ReadStatus.ABANDONED]: 'abandoned',
  [ReadStatus.UNSET]: 'noStatus',
};

@Component({
  selector: 'app-read-status-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [
    BaseChartDirective,
    StatsChartCardComponent,
    StatsCircularChartLayoutComponent,
    TranslocoDirective,
  ],
  templateUrl: './read-status-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadStatusChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<ReadStatusStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'doughnut' as const;
  readonly slices = computed<readonly ReadStatusSlice[]>(() => this.stats().slices);
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
    return this.slices().length > 0 ? 'ready' : 'empty';
  });
  readonly emptyMessage = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.bookFlow.noData');
  });
  readonly legend = computed<readonly ReadStatusLegendEntry[]>(() =>
    this.slices().map((slice) => ({
      status: slice.status,
      label: this.statusLabel(slice.status),
      color: STATUS_COLORS[slice.status],
      bookCount: slice.bookCount,
    })),
  );

  readonly chartData = computed<ReadStatusChartData>(() => {
    const slices = this.slices();

    return {
      labels: slices.map((slice) => this.statusLabel(slice.status)),
      datasets: [
        {
          data: slices.map((slice) => slice.bookCount),
          backgroundColor: slices.map((slice) => STATUS_COLORS[slice.status]),
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'doughnut'>['options']>(() => {
    const slices = this.slices();

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
              const slice = slices.at(context.dataIndex);
              if (!slice) return '';

              return this.transloco.translate('statsUser.readStatus.tooltipLabel', {
                label: this.statusLabel(slice.status),
                value: slice.bookCount,
                percentage: slice.sharePercent.toFixed(1),
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

  private statusLabel(status: ReadStatus): string {
    this.activeLanguage();
    return this.transloco.translate(`statsUser.readStatus.${STATUS_LABEL_KEYS[status]}`);
  }
}
