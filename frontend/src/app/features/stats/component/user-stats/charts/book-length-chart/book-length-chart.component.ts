import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData, type ScatterDataPoint } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import {
  type BookLengthStats,
  type BookLengthStatusGroup,
} from '../../../../data/user/book-length-stats';

interface BookLengthDatum extends ScatterDataPoint {
  readonly title?: string;
  readonly group?: BookLengthStatusGroup;
}

type BookLengthChartData = ChartData<'scatter', BookLengthDatum[], string>;

const CHART_FONT_FAMILY = "'Inter', sans-serif";

const GROUP_COLORS: Readonly<Record<BookLengthStatusGroup, { fill: string; border: string }>> = {
  read: { fill: 'rgba(76, 175, 80, 0.7)', border: '#4caf50' },
  reading: { fill: 'rgba(33, 150, 243, 0.7)', border: '#2196f3' },
  abandoned: { fill: 'rgba(244, 67, 54, 0.7)', border: '#f44336' },
  other: { fill: 'rgba(158, 158, 158, 0.7)', border: '#9e9e9e' },
};

const GROUP_LABEL_KEYS: Readonly<Record<BookLengthStatusGroup, string>> = {
  read: 'statusRead',
  reading: 'statusReading',
  abandoned: 'statusAbandoned',
  other: 'statusOther',
};

@Component({
  selector: 'app-book-length-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './book-length-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class BookLengthChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<BookLengthStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'scatter' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalRatedBooks > 0 ? 'ready' : 'empty';
  });
  readonly emptyMessage = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.bookFlow.noData');
  });
  readonly chartData = computed<BookLengthChartData>(() => {
    const points = this.stats().points;
    const datasets: BookLengthChartData['datasets'] = this.stats().groups.map((group) => {
      const groupPoints = points.filter((point) => point.group === group);

      return {
        label: `${this.groupLabel(group)} (${groupPoints.length})`,
        data: groupPoints.map<BookLengthDatum>((point) => ({
          x: point.pageCount,
          y: point.personalRating,
          title: point.title,
          group: point.group,
        })),
        backgroundColor: GROUP_COLORS[group].fill,
        borderColor: GROUP_COLORS[group].border,
        pointRadius: 6,
        pointHoverRadius: 9,
        pointBorderWidth: 2,
      };
    });

    const trendLine = this.stats().trendLine;
    if (trendLine) {
      datasets.push({
        label: this.transloco.translate('statsUser.bookLength.trend'),
        data: trendLine.map((point) => ({
          x: point.pageCount,
          y: point.personalRating,
        })),
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        pointRadius: 0,
        pointHoverRadius: 0,
        pointBorderWidth: 0,
      });
    }

    return { datasets };
  });

  readonly chartOptions = computed<ChartConfiguration<'scatter'>['options']>(() => {
    this.activeLanguage();

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, right: 20, bottom: 10, left: 10 } },
      scales: {
        x: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.bookLength.axisPageCount'),
            font: { family: CHART_FONT_FAMILY, size: 12, weight: 'bold' },
          },
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 } },
        },
        y: {
          min: 0,
          max: 10,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.bookLength.axisPersonalRating'),
            font: { family: CHART_FONT_FAMILY, size: 12, weight: 'bold' },
          },
          ticks: { stepSize: 1, font: { family: CHART_FONT_FAMILY, size: 11 } },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { family: CHART_FONT_FAMILY, size: 11 },
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 15,
          },
        },
        tooltip: {
          enabled: true,
          borderColor: '#00bcd4',
          borderWidth: 2,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: CHART_FONT_FAMILY, size: 13, weight: 'bold' },
          bodyFont: { family: CHART_FONT_FAMILY, size: 11 },
          callbacks: {
            title: (context) => {
              const datum = context[0].raw as BookLengthDatum;
              return (
                datum.title || this.transloco.translate('statsUser.bookLength.tooltipUnknownBook')
              );
            },
            label: (context) => {
              const datum = context.raw as BookLengthDatum;

              return [
                this.transloco.translate('statsUser.bookLength.tooltipPages', { count: datum.x }),
                this.transloco.translate('statsUser.bookLength.tooltipRating', { rating: datum.y }),
                this.transloco.translate('statsUser.bookLength.tooltipStatus', {
                  status: datum.group ? this.groupLabel(datum.group) : '',
                }),
              ];
            },
          },
        },
      },
      elements: { point: { radius: 6, hoverRadius: 9, borderWidth: 2 } },
    };
  });

  protected formatCount(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }

  protected formatRating(value: number): string {
    return value.toLocaleString(this.activeLanguage(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  protected rangeLabel(minimum: number, maximum: number | null): string {
    return maximum === null ? `${minimum}+` : `${minimum}-${maximum}`;
  }

  private groupLabel(group: BookLengthStatusGroup): string {
    this.activeLanguage();
    return this.transloco.translate(`statsUser.bookLength.${GROUP_LABEL_KEYS[group]}`);
  }
}
