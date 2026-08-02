import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartData, type ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import {
  COMPLETION_TIMELINE_SERIES,
  type CompletionTimelineSeriesId,
  type CompletionTimelineStats,
} from '../../../../data/user/completion-timeline-stats';

type CompletionTimelineChartData = ChartData<'bar', number[], string>;

interface CompletionTimelineLegendEntry {
  readonly id: CompletionTimelineSeriesId;
  readonly label: string;
  readonly color: string;
}

const SERIES_COLORS: Readonly<Record<CompletionTimelineSeriesId, string>> = {
  completed: 'rgba(106, 176, 76, 0.8)',
  partiallyRead: 'rgba(20, 184, 166, 0.8)',
  activeReading: 'rgba(59, 130, 246, 0.8)',
  paused: 'rgba(255, 193, 7, 0.8)',
  discontinued: 'rgba(239, 68, 68, 0.8)',
};

const SERIES_LABEL_KEYS: Readonly<Record<CompletionTimelineSeriesId, string>> = {
  completed: 'statsUser.completionTimeline.completed',
  partiallyRead: 'statsUser.readStatus.partiallyRead',
  activeReading: 'statsUser.completionTimeline.activeReading',
  paused: 'statsUser.completionTimeline.paused',
  discontinued: 'statsUser.completionTimeline.discontinued',
};

@Component({
  selector: 'app-completion-timeline-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [AppSelectComponent, BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
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
  readonly yearOptions = input<readonly number[]>([]);
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly yearChange = output<number>();

  readonly chartType = 'bar' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });

  readonly yearSelectOptions = computed<readonly SelectOption<number>[]>(() => {
    return this.yearOptions().map((year) => ({ value: year, label: String(year) }));
  });
  readonly yearSelectorLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.peakHours.selectYear');
  });
  readonly legend = computed<readonly CompletionTimelineLegendEntry[]>(() => {
    this.activeLanguage();
    return COMPLETION_TIMELINE_SERIES.map((id) => ({
      id,
      label: this.transloco.translate(SERIES_LABEL_KEYS[id]),
      color: SERIES_COLORS[id],
    }));
  });
  readonly monthLabels = computed<readonly string[]>(() => {
    const locale = this.activeLanguage();
    return Array.from({ length: 12 }, (_, index) =>
      new Date(2000, index, 1).toLocaleDateString(locale, { month: 'short' }),
    );
  });

  readonly chartData = computed<CompletionTimelineChartData>(() => {
    const months = this.stats().months;
    const legend = this.legend();

    return {
      labels: [...this.monthLabels()],
      datasets: legend.map((entry) => ({
        label: entry.label,
        data: months.map((month) => month[entry.id]),
        backgroundColor: entry.color,
        borderColor: entry.color.replace('0.8)', '1)'),
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
        legend: { display: false },
        tooltip: {
          borderWidth: 1,
          cornerRadius: 6,
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
            font: { size: 13, weight: 'bold' },
          },
          ticks: { font: { size: 11 } },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.completionTimeline.axisNumberOfBooks'),
            font: { size: 13, weight: 'bold' },
          },
          beginAtZero: true,
          ticks: { font: { size: 11 }, stepSize: 1 },
          border: { display: false },
        },
      },
    };
  });

  protected onYearChange(year: number | null): void {
    if (year !== null) this.yearChange.emit(year);
  }
}
