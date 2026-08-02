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

interface FavoriteDaysLegendEntry {
  readonly id: 'sessions' | 'duration';
  readonly label: string;
  readonly color: string;
}

const SESSIONS_COLOR = 'rgba(139, 92, 246, 0.8)';
const SESSIONS_BORDER = 'rgba(139, 92, 246, 1)';
const DURATION_COLOR = 'rgba(236, 72, 153, 0.8)';
const DURATION_BORDER = 'rgba(236, 72, 153, 1)';

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
  readonly paramsChange = output<{ year: number | null; month: number | null }>();

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
  protected readonly legend = computed<readonly FavoriteDaysLegendEntry[]>(() => {
    this.activeLanguage();
    return [
      {
        id: 'sessions',
        label: this.transloco.translate('statsUser.favoriteDays.sessions'),
        color: SESSIONS_BORDER,
      },
      {
        id: 'duration',
        label: this.transloco.translate('statsUser.favoriteDays.durationHours'),
        color: DURATION_BORDER,
      },
    ];
  });
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
    return this.stats().totalSessions > 0 ? 'ready' : 'empty';
  });

  protected readonly chartData = computed<ChartData<'bar', number[], string>>(() => {
    this.activeLanguage();
    const days = this.stats().days;

    return {
      labels: days.map((day) => this.weekdayLabel(day.dayIndex)),
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
            font: { size: 13, weight: 'bold' },
          },
          ticks: { font: { size: 11 } },
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
            font: { size: 13, weight: 'bold' },
          },
          ticks: { font: { size: 11 }, stepSize: 1 },
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
            font: { size: 13, weight: 'bold' },
          },
          ticks: {
            font: { size: 11 },
            callback: (value) => `${typeof value === 'number' ? value.toFixed(1) : '0.0'}h`,
          },
          grid: { drawOnChartArea: false },
          border: { display: false },
        },
      },
    };
  });

  protected onYearChange(year: number | null): void {
    this.paramsChange.emit({ year, month: this.month() });
  }

  protected onMonthChange(month: number | null): void {
    this.paramsChange.emit({ year: this.year(), month });
  }

  private weekdayLabel(dayIndex: number): string {
    return new Intl.DateTimeFormat(this.activeLanguage(), {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(Date.UTC(2023, 0, 1 + dayIndex));
  }

  private formatHours(value: number): string {
    const hours = Math.floor(value);
    const minutes = Math.round((value % 1) * 60);
    return `${hours}h ${minutes}m`;
  }
}
