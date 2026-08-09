import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { type ChartData, type ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { AppButtonComponent } from '../../../../../../shared/ui/button/app-button.component';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { type CompletionTimelineStats } from '../../../../data/user/completion-timeline-stats';

type CompletionTimelineChartData = ChartData<'bar', number[], string>;
type CompletionTimelineSeriesId = 'completed' | 'activeReading' | 'paused' | 'discontinued';

const COMPLETION_TIMELINE_SERIES: readonly CompletionTimelineSeriesId[] = [
  'completed',
  'activeReading',
  'paused',
  'discontinued',
];

const SERIES_COLORS: Readonly<Record<CompletionTimelineSeriesId, string>> = {
  completed: 'rgba(106, 176, 76, 0.8)',
  activeReading: 'rgba(59, 130, 246, 0.8)',
  paused: 'rgba(255, 193, 7, 0.8)',
  discontinued: 'rgba(239, 68, 68, 0.8)',
};

const SERIES_LABEL_KEYS: Readonly<Record<CompletionTimelineSeriesId, string>> = {
  completed: 'statsUser.completionTimeline.completed',
  activeReading: 'statsUser.completionTimeline.activeReading',
  paused: 'statsUser.completionTimeline.paused',
  discontinued: 'statsUser.completionTimeline.discontinued',
};

const CHART_FONT_FAMILY = "'Inter', sans-serif";
const MONTH_LABELS: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

@Component({
  selector: 'app-completion-timeline-chart',
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
  templateUrl: './completion-timeline-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class CompletionTimelineChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<CompletionTimelineStats>();
  readonly year = input.required<number>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly yearChange = output<number>();

  readonly chartType = 'bar' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });

  readonly previousYearLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.completionTimeline.previousYear');
  });
  readonly nextYearLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.completionTimeline.nextYear');
  });
  readonly chartData = computed<CompletionTimelineChartData>(() => {
    this.activeLanguage();
    const months = this.stats().months;

    return {
      labels: [...MONTH_LABELS],
      datasets: COMPLETION_TIMELINE_SERIES.map((series) => ({
        label: this.transloco.translate(SERIES_LABEL_KEYS[series]),
        data: months.map((month) => series === 'completed'
          ? month.finished + month.partiallyRead
          : month[series]),
        backgroundColor: SERIES_COLORS[series],
        borderColor: SERIES_COLORS[series].replace('0.8)', '1)'),
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.8,
        categoryPercentage: 0.6,
      })),
    };
  });

  readonly chartOptions = computed<ChartOptions<'bar'>>(() => {
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
              const value = context.parsed.y;
              return this.transloco.translate(
                value === 1
                  ? 'statsUser.completionTimeline.tooltipBook'
                  : 'statsUser.completionTimeline.tooltipBooks',
                { label: context.dataset.label ?? '', value },
              );
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.completionTimeline.axisMonth'),
            font: { family: CHART_FONT_FAMILY, size: 13, weight: 'bold' },
          },
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 } },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.completionTimeline.axisNumberOfBooks'),
            font: { family: CHART_FONT_FAMILY, size: 13, weight: 'bold' },
          },
          beginAtZero: true,
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 }, stepSize: 1 },
          border: { display: false },
        },
      },
    };
  });

  protected changeYear(delta: number): void {
    this.yearChange.emit(this.year() + delta);
  }
}
