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
import { type PeakHoursStats } from '../../../../data/user/peak-hours-stats';
import { type UserStatsMonthFilter } from '../../../../data/user/user-stats-transport';

const SESSIONS_COLOR = 'rgba(34, 197, 94, 0.9)';
const SESSIONS_FILL = 'rgba(34, 197, 94, 0.1)';
const DURATION_COLOR = 'rgba(251, 191, 36, 0.9)';
const DURATION_FILL = 'rgba(251, 191, 36, 0.1)';

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
  selector: 'app-peak-hours-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [AppSelectComponent, BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './peak-hours-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class PeakHoursChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<PeakHoursStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly year = input<number | null>(null);
  readonly month = input<number | null>(null);
  readonly yearOptions = input<readonly number[]>([]);
  readonly paramsChange = output<UserStatsMonthFilter>();

  protected readonly chartType = 'line' as const;

  protected readonly yearSelectOptions = computed<readonly SelectOption<number>[]>(() =>
    this.yearOptions().map((year) => ({ value: year, label: year.toString() })),
  );
  protected readonly monthSelectOptions = computed<readonly SelectOption<number>[]>(() => {
    this.activeLanguage();
    return MONTH_KEYS.map((key, index) => ({
      value: index + 1,
      label: this.transloco.translate(`statsUser.peakHours.${key}`),
    }));
  });
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalSessions > 0 ? 'ready' : 'empty';
  });

  protected readonly chartData = computed<ChartData<'line', number[], string>>(() => {
    this.activeLanguage();
    const hours = this.stats().hours;

    return {
      labels: hours.map((entry) => this.hourLabel(entry.hour)),
      datasets: [
        {
          label: this.transloco.translate('statsUser.peakHours.sessions'),
          data: hours.map((entry) => entry.sessionCount),
          borderColor: SESSIONS_COLOR,
          backgroundColor: SESSIONS_FILL,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: SESSIONS_COLOR,
          pointBorderWidth: 2,
          yAxisID: 'y',
        },
        {
          label: this.transloco.translate('statsUser.peakHours.avgDurationMin'),
          data: hours.map((entry) => entry.averageDurationMinutes),
          borderColor: DURATION_COLOR,
          backgroundColor: DURATION_FILL,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: DURATION_COLOR,
          pointBorderWidth: 2,
          yAxisID: 'y1',
        },
      ],
    };
  });

  protected readonly chartOptions = computed<ChartConfiguration<'line'>['options']>(() => {
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
            font: { family: "'Inter', sans-serif", size: 11 },
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
              const value = context.parsed.y;
              const sessionsLabel = this.transloco.translate('statsUser.peakHours.sessions');
              if (label === sessionsLabel) {
                return this.transloco.translate(
                  value === 1
                    ? 'statsUser.peakHours.tooltipSessions'
                    : 'statsUser.peakHours.tooltipSessionsPlural',
                  { label, value },
                );
              }
              return this.transloco.translate('statsUser.peakHours.tooltipMin', { label, value });
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.peakHours.axisHourOfDay'),
            font: { family: "'Inter', sans-serif", size: 13, weight: 'bold' },
          },
          ticks: { font: { family: "'Inter', sans-serif", size: 11 } },
          border: { display: false },
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.peakHours.axisNumberOfSessions'),
            color: SESSIONS_COLOR,
            font: { family: "'Inter', sans-serif", size: 13, weight: 'bold' },
          },
          ticks: { font: { family: "'Inter', sans-serif", size: 11 }, stepSize: 1 },
          border: { display: false },
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          beginAtZero: true,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.peakHours.axisAvgDuration'),
            color: DURATION_COLOR,
            font: { family: "'Inter', sans-serif", size: 13, weight: 'bold' },
          },
          ticks: {
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: (value) => `${typeof value === 'number' ? Math.round(value) : '0'}m`,
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

  private hourLabel(hour: number): string {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  }
}
