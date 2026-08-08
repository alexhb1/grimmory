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
import { type PersonalRatingStats } from '../../../../data/user/personal-rating-stats';

type PersonalRatingChartData = ChartData<'bar', number[], string>;

const CHART_FONT_FAMILY = "'Inter', sans-serif";

const RATING_COLORS: readonly string[] = [
  '#DC2626',
  '#EA580C',
  '#F59E0B',
  '#EAB308',
  '#FACC15',
  '#BEF264',
  '#65A30D',
  '#16A34A',
  '#059669',
  '#2563EB',
];

@Component({
  selector: 'app-personal-rating-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './personal-rating-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class PersonalRatingChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<PersonalRatingStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'bar' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalRatedBooks > 0 ? 'ready' : 'empty';
  });
  readonly emptyMessage = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.bookFlow.noData');
  });

  readonly chartData = computed<PersonalRatingChartData>(() => {
    this.activeLanguage();
    const buckets = this.stats().buckets;
    const colors = buckets.map((_, index) => RATING_COLORS[index % RATING_COLORS.length]);

    return {
      labels: buckets.map((bucket) => String(bucket.rating)),
      datasets: [
        {
          label: this.transloco.translate('statsUser.personalRating.booksByPersonalRating'),
          data: buckets.map((bucket) => bucket.bookCount),
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.8,
          categoryPercentage: 0.6,
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    this.activeLanguage();

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 25 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderWidth: 1,
          cornerRadius: 6,
          displayColors: true,
          padding: 12,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          callbacks: {
            title: (context) =>
              this.transloco.translate('statsUser.personalRating.tooltipTitle', {
                label: context[0].label,
              }),
            label: (context) => {
              const value = context.parsed.y;
              return this.transloco.translate(
                value === 1
                  ? 'statsUser.personalRating.tooltipBook'
                  : 'statsUser.personalRating.tooltipBooks',
                { value },
              );
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.personalRating.axisPersonalRating'),
            font: { family: CHART_FONT_FAMILY, size: 12 },
          },
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 } },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.personalRating.axisNumberOfBooks'),
            font: { family: CHART_FONT_FAMILY, size: 12 },
          },
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 }, stepSize: 1, maxTicksLimit: 8 },
          border: { display: false },
        },
      },
    };
  });
}
