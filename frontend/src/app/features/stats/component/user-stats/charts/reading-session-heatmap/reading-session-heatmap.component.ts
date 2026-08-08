import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Chart, type ChartConfiguration, type ChartData } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { BaseChartDirective } from 'ng2-charts';

import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { readStatsChartThemeColors } from '../../../shared/stats-chart-theme.service';
import {
  type ReadingMilestoneId,
  type ReadingStreaks,
  type SessionHeatmapCalendar,
} from '../../../../data/user/reading-session-heatmap-stats';

interface SessionHeatmapStats {
  readonly calendar: SessionHeatmapCalendar;
  readonly streaks: ReadingStreaks;
}

interface MatrixDataPoint {
  x: number;
  y: number;
  v: number;
  date: string;
}

Chart.register(MatrixController, MatrixElement);

@Component({
  selector: 'app-reading-session-heatmap',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [AppSelectComponent, BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './reading-session-heatmap.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadingSessionHeatmapComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<SessionHeatmapStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly year = input.required<number>();
  readonly yearOptions = input<readonly number[]>([]);
  readonly yearChange = output<number>();

  protected readonly chartType = 'matrix' as const;

  protected readonly streaks = computed(() => this.stats().streaks);
  protected readonly yearSelectOptions = computed<readonly SelectOption<number>[]>(() => {
    const years = new Set(this.yearOptions());
    years.add(this.year());
    return Array.from(years)
      .sort((left, right) => right - left)
      .map((year) => ({ value: year, label: year.toString() }));
  });
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
    return this.stats().calendar.totalSessions > 0 ? 'ready' : 'empty';
  });

  protected readonly chartData = computed<ChartData<'matrix', MatrixDataPoint[], string>>(() => {
    const { cells, maxCount } = this.stats().calendar;
    const scale = Math.max(1, maxCount);

    return {
      labels: [],
      datasets: [
        {
          label: this.transloco.translate('statsUser.sessionHeatmap.readingSessions'),
          data: cells.map((cell) => ({
            x: cell.week,
            y: cell.weekday,
            v: cell.count,
            date: cell.date,
          })),
          backgroundColor: (context) => {
            const point = context.raw as MatrixDataPoint | undefined;
            if (!point?.v) return readStatsChartThemeColors().grid;

            const alpha = Math.max(0.3, Math.min(0.9, (point.v / scale) * 0.6 + 0.3));
            return `rgba(59, 130, 246, ${alpha})`;
          },
          borderWidth: 1,
        },
      ],
    };
  });

  protected readonly chartOptions = computed<ChartConfiguration<'matrix'>['options']>(() => {
    const locale = this.activeLanguage();
    const { weekMonths } = this.stats().calendar;

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20, bottom: 20, left: 10, right: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderWidth: 1,
          cornerRadius: 6,
          displayColors: false,
          padding: 12,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          callbacks: {
            title: (context) => {
              const point = context[0].raw as MatrixDataPoint;
              return new Intl.DateTimeFormat(locale, {
                timeZone: 'UTC',
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              }).format(Date.parse(point.date));
            },
            label: (context) => {
              const point = context.raw as MatrixDataPoint;
              return this.transloco.translate(
                point.v === 1
                  ? 'statsUser.sessionHeatmap.readingSession'
                  : 'statsUser.sessionHeatmap.readingSessions_plural',
                { count: point.v },
              );
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          position: 'top',
          min: 0,
          max: Math.max(0, weekMonths.length - 1),
          ticks: {
            stepSize: 4,
            callback: (value) => {
              const week = value as number;
              if (week % 4 !== 0) return '';
              const month = weekMonths.at(week);
              return month === undefined ? '' : this.monthLabel(month);
            },
            font: { size: 11 },
          },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          type: 'linear',
          min: 0,
          max: 6,
          ticks: {
            stepSize: 1,
            callback: (value) => this.weekdayLabel(value as number),
            font: { size: 11 },
          },
          border: { display: false },
        },
      },
    };
  });

  protected onYearChange(year: number | null): void {
    if (year !== null) this.yearChange.emit(year);
  }

  protected formatCount(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }

  protected milestoneIcon(id: ReadingMilestoneId): string {
    return {
      '7-day-streak': '🔥',
      '30-day-streak': '⚡',
      '100-reading-days': '📚',
      '365-reading-days': '🏆',
      'year-long-streak': '👑',
    }[id];
  }

  protected milestoneLabel(id: ReadingMilestoneId): string {
    const keys: Record<ReadingMilestoneId, string> = {
      '7-day-streak': 'milestone7DayStreak',
      '30-day-streak': 'milestone30DayStreak',
      '100-reading-days': 'milestone100ReadingDays',
      '365-reading-days': 'milestone365ReadingDays',
      'year-long-streak': 'milestoneYearOfReading',
    };
    return this.transloco.translate(`statsUser.sessionHeatmap.${keys[id]}`);
  }

  private monthLabel(month: number): string {
    return new Intl.DateTimeFormat(this.activeLanguage(), {
      month: 'short',
      timeZone: 'UTC',
    }).format(Date.UTC(2023, month, 1));
  }

  private weekdayLabel(weekday: number): string {
    if (weekday < 0 || weekday > 6) return '';
    return new Intl.DateTimeFormat(this.activeLanguage(), {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(Date.UTC(2023, 0, 2 + weekday));
  }
}
