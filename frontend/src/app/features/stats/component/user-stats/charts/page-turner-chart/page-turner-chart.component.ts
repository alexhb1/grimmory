import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartData, type ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { type PageTurnerStats } from '../../../../data/user/page-turner-stats';

type PageTurnerChartData = ChartData<'bar', number[], string>;

const LABEL_LIMIT = 25;
const CHART_LIMIT = 15;
const HIGHLIGHT_LIMIT = 3;
const CHART_FONT_FAMILY = "'Inter', sans-serif";

@Component({
  selector: 'app-page-turner-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './page-turner-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class PageTurnerChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<PageTurnerStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'bar' as const;
  readonly chartRanking = computed(() => this.stats().ranking.slice(0, CHART_LIMIT));
  readonly highlights = computed(() => this.stats().ranking.slice(0, HIGHLIGHT_LIMIT));
  readonly mostGripping = computed(() => this.stats().ranking[0] ?? null);
  readonly guiltyPleasure = computed(() => this.stats().guiltyPleasure);
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().ranking.length > 0 ? 'ready' : 'empty';
  });

  readonly chartData = computed<PageTurnerChartData>(() => {
    this.activeLanguage();
    const ranking = this.chartRanking();
    const colors = ranking.map((book) => gripColor(book.gripScore));

    return {
      labels: ranking.map((book) => truncate(book.bookTitle, LABEL_LIMIT)),
      datasets: [
        {
          label: this.transloco.translate('statsUser.pageTurner.gripScore'),
          data: ranking.map((book) => book.gripScore),
          backgroundColor: colors,
          borderColor: colors.map((color) => color.replace('0.85', '1')),
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.8,
          categoryPercentage: 0.7,
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartOptions<'bar'>>(() => {
    this.activeLanguage();
    const ranking = this.chartRanking();

    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, bottom: 10, left: 10, right: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderColor: 'rgba(251, 146, 60, 0.8)',
          borderWidth: 2,
          cornerRadius: 8,
          displayColors: false,
          padding: 16,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          callbacks: {
            label: (context) => {
              const book = ranking.at(context.dataIndex);
              if (!book) return '';

              const lines = [
                this.transloco.translate('statsUser.pageTurner.tooltipGripScore', {
                  score: book.gripScore,
                }),
                this.transloco.translate('statsUser.pageTurner.tooltipSessions', {
                  count: book.totalSessions,
                }),
                this.transloco.translate('statsUser.pageTurner.tooltipAvgSession', {
                  minutes: Math.round(book.avgSessionDurationSeconds / 60),
                }),
              ];

              if (book.personalRating) {
                lines.push(
                  this.transloco.translate('statsUser.pageTurner.tooltipRating', {
                    rating: book.personalRating,
                  }),
                );
              }

              return lines;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.pageTurner.axisGripScore'),
            font: { family: CHART_FONT_FAMILY, size: 13, weight: 'bold' },
          },
          min: 0,
          max: 100,
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 } },
          border: { display: false },
        },
        y: {
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 } },
          grid: { display: false },
          border: { display: false },
        },
      },
    };
  });
}

function gripColor(gripScore: number): string {
  const ratio = gripScore / 100;
  const red = Math.round(59 + ratio * (239 - 59));
  const green = Math.round(130 + ratio * (68 - 130));
  const blue = Math.round(246 + ratio * (68 - 246));
  return `rgba(${red}, ${green}, ${blue}, 0.85)`;
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength)}...` : value;
}
