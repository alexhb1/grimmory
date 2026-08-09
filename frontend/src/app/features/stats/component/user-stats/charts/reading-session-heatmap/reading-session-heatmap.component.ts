import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Chart, type ChartConfiguration, type ChartData } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { BaseChartDirective } from 'ng2-charts';

import { AppButtonComponent } from '../../../../../../shared/ui/button/app-button.component';
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

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

Chart.register(MatrixController, MatrixElement);

@Component({
  selector: 'app-reading-session-heatmap',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [
    AppButtonComponent,
    BaseChartDirective,
    LucideChevronLeft,
    LucideChevronRight,
    StatsChartCardComponent,
    TranslocoDirective,
  ],
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
  readonly yearChange = output<number>();

  protected readonly chartType = 'matrix' as const;

  protected readonly streaks = computed(() => this.stats().streaks);
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
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
              return new Intl.DateTimeFormat('en-US', {
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
          max: 52,
          ticks: {
            stepSize: 4,
            callback: (value) => {
              const week = value as number;
              if (week % 4 !== 0) return '';
              return MONTH_NAMES[this.dateFromWeek(this.year(), week).getMonth()];
            },
            font: { family: "'Inter', sans-serif", size: 11 },
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
            callback: (value) => DAY_NAMES[value as number] ?? '',
            font: { family: "'Inter', sans-serif", size: 11 },
          },
          border: { display: false },
        },
      },
    };
  });

  protected onYearStep(delta: number): void {
    this.yearChange.emit(this.year() + delta);
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

  private dateFromWeek(year: number, week: number): Date {
    const date = new Date(year, 0, 1);
    date.setDate(date.getDate() + week * 7 - date.getDay());
    return date;
  }
}
