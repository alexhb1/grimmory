import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { type FavoriteDaysStats } from '../../../../data/user/favorite-days-stats';
import { type UserStatsMonthFilter } from '../../../../data/user/user-stats-transport';

const SESSIONS_COLOR = 'rgba(139, 92, 246, 0.8)';
const SESSIONS_BORDER = 'rgba(139, 92, 246, 1)';
const DURATION_COLOR = 'rgba(236, 72, 153, 0.8)';
const DURATION_BORDER = 'rgba(236, 72, 153, 1)';
const CHART_FONT_FAMILY = "'Inter', sans-serif";
const WEEKDAY_LABELS: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTH_KEYS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

@Component({
  selector: 'app-favorite-days-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [AppSelectComponent, BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './favorite-days-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class FavoriteDaysChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<FavoriteDaysStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly year = input<number | null>(null);
  readonly month = input<number | null>(null);
  readonly yearOptions = input<readonly number[]>([]);
  readonly paramsChange = output<UserStatsMonthFilter>();

  protected readonly chartType = 'bar' as const;

  protected readonly yearSelectOptions = computed<readonly SelectOption<number>[]>(() =>
    this.yearOptions().map((year) => ({ value: year, label: year.toString() })),
  );
  protected readonly monthSelectOptions = computed<readonly SelectOption<number>[]>(() => {
    this.activeLanguage();
    return MONTH_KEYS.map((key, index) => ({
      value: index + 1,
      label: this.transloco.translate(`statsUser.favoriteDays.${key}`),
    }));
  });
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalSessions > 0 ? 'ready' : 'empty';
  });

  protected readonly chartData = computed<ChartData<'bar', number[], string>>(() => {
    this.activeLanguage();
    const days = this.stats().days;

    return {
      labels: days.map((day) => WEEKDAY_LABELS[day.dayIndex]),
      datasets: [
        {
          label: this.transloco.translate('statsUser.favoriteDays.sessions'),
          data: days.map((day) => day.sessionCount),
          backgroundColor: SESSIONS_COLOR,
          borderColor: SESSIONS_BORDER,
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.8,
          categoryPercentage: 0.6,
          yAxisID: 'y',
        },
        {
          label: this.transloco.translate('statsUser.favoriteDays.durationHours'),
          data: days.map((day) => day.durationHours),
          backgroundColor: DURATION_COLOR,
          borderColor: DURATION_BORDER,
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.8,
          categoryPercentage: 0.6,
          yAxisID: 'y1',
        },
      ],
    };
  });

  protected readonly chartOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    this.activeLanguage();

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, bottom: 10, left: 10, right: 10 } },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { family: CHART_FONT_FAMILY, size: 11 },
            boxWidth: 12,
            padding: 10,
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
            label: (context) => {
              const label = context.dataset.label ?? '';
              const value = context.parsed.y ?? 0;
              if (context.dataset.yAxisID === 'y1') {
                return `${label}: ${this.formatHours(value)}`;
              }
              return this.transloco.translate(
                value === 1
                  ? 'statsUser.favoriteDays.tooltipSessions'
                  : 'statsUser.favoriteDays.tooltipSessionsPlural',
                { label, value },
              );
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.favoriteDays.axisDayOfWeek'),
            font: { family: CHART_FONT_FAMILY, size: 13, weight: 'bold' },
          },
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 } },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.favoriteDays.axisNumberOfSessions'),
            color: SESSIONS_BORDER,
            font: { family: CHART_FONT_FAMILY, size: 13, weight: 'bold' },
          },
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 }, stepSize: 1 },
          border: { display: false },
        },
        y1: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.favoriteDays.axisDurationHours'),
            color: DURATION_BORDER,
            font: { family: CHART_FONT_FAMILY, size: 13, weight: 'bold' },
          },
          ticks: {
            font: { family: CHART_FONT_FAMILY, size: 11 },
            callback: (value) => `${typeof value === 'number' ? value.toFixed(1) : '0.0'}h`,
          },
          grid: { drawOnChartArea: false },
          border: { display: false },
        },
      },
    };
  });

  protected onYearChange(year: number | null): void {
    this.paramsChange.emit(year === null ? { year, month: null } : { year, month: this.month() });
  }

  protected onMonthChange(month: number | null): void {
    const year = this.year();
    this.paramsChange.emit(year === null ? { year, month: null } : { year, month });
  }

  private formatHours(value: number): string {
    const hours = Math.floor(value);
    const minutes = Math.floor((value % 1) * 60);
    return `${hours}h ${minutes}m`;
  }
}
