import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type Chart, type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { ReadStatus } from '../../../../../book/model/book.model';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { type ReadStatusSlice, type ReadStatusStats } from '../../../../data/user/read-status-stats';

interface DatasetMetaPoint {
  readonly hidden?: boolean;
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
    if (this.loading()) return 'loading';
    return this.slices().length > 0 ? 'ready' : 'empty';
  });
  readonly emptyMessage = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.readStatus.noData');
  });

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
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 15 } },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            padding: 15,
            usePointStyle: true,
            font: { family: CHART_FONT_FAMILY, size: 12 },
            generateLabels: (chart) => this.generateLegendLabels(chart),
          },
        },
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
              const value = context.dataset.data[context.dataIndex];
              const label = context.chart.data.labels?.[context.dataIndex] ?? '';
              const total = context.dataset.data.reduce((sum, count) => sum + count, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';

              return this.transloco.translate('statsUser.readStatus.tooltipLabel', {
                label,
                value,
                percentage,
              });
            },
          },
        },
      },
      interaction: { intersect: false, mode: 'point' },
    };
  });

  private generateLegendLabels(chart: Chart) {
    const data = chart.data;
    if (!data.labels?.length || !data.datasets[0]?.data.length) return [];

    const dataset = data.datasets[0];
    const values = dataset.data as number[];
    const colors = dataset.backgroundColor as string[];

    return data.labels.map((label, index) => {
      const metaPoint = chart.getDatasetMeta(0).data[index] as DatasetMetaPoint | undefined;
      const visible = chart.getDataVisibility(index) && !metaPoint?.hidden;

      return {
        text: `${String(label)} (${values[index]})`,
        fillStyle: colors[index],
        lineWidth: 1,
        hidden: !visible,
        index,
      };
    });
  }

  private statusLabel(status: ReadStatus): string {
    this.activeLanguage();
    return this.transloco.translate(`statsUser.readStatus.${STATUS_LABEL_KEYS[status]}`);
  }
}
