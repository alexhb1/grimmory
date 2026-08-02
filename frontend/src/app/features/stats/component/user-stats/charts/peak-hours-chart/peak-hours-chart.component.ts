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

interface PeakHoursLegendEntry {
  readonly id: 'sessions' | 'duration';
  readonly label: string;
  readonly color: string;
}

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
  readonly paramsChange = output<{ year: number | null; month: number | null }>();

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
  protected readonly legend = computed<readonly PeakHoursLegendEntry[]>(() => {
    this.activeLanguage();
    return [
      {
        id: 'sessions',
        label: this.transloco.translate('statsUser.peakHours.sessions'),
        color: SESSIONS_COLOR,
      },
      {
        id: 'duration',
        label: this.transloco.translate('statsUser.peakHours.avgDurationMin'),
        color: DURATION_COLOR,
      },
    ];
  });
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
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
              const value = context.parsed.y;
              if (context.dataset.yAxisID === 'y1') {
                return this.transloco.translate('statsUser.peakHours.tooltipMin', { label, value });
              }
              return this.transloco.translate(
                value === 1
                  ? 'statsUser.peakHours.tooltipSessions'
                  : 'statsUser.peakHours.tooltipSessionsPlural',
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
            text: this.transloco.translate('statsUser.peakHours.axisHourOfDay'),
            font: { size: 13, weight: 'bold' },
          },
          ticks: { font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 },
          border: { display: false },
        },
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.peakHours.axisNumberOfSessions'),
            color: SESSIONS_COLOR,
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
            text: this.transloco.translate('statsUser.peakHours.axisAvgDuration'),
            color: DURATION_COLOR,
            font: { size: 13, weight: 'bold' },
          },
          ticks: {
            font: { size: 11 },
            callback: (value) => `${typeof value === 'number' ? Math.round(value) : 0}m`,
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

  private hourLabel(hour: number): string {
    return new Intl.DateTimeFormat(this.activeLanguage(), {
      hour: 'numeric',
      timeZone: 'UTC',
    }).format(Date.UTC(2023, 0, 1, hour));
  }
}
