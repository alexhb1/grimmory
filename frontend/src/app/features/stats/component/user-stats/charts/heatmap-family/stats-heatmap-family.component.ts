import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { Chart, type ChartConfiguration, type ChartData } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { BaseChartDirective } from 'ng2-charts';

import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';
import { readStatsChartThemeColors } from '../../../shared/stats-chart-theme.service';
import { presentReadingMonths } from './reading-months.presenter';
import { presentSessionCalendar } from './session-calendar.presenter';
import {
  type StatsHeatmapDatum,
  type StatsHeatmapFamilyChart,
  type StatsHeatmapPresentation,
} from './stats-heatmap-family.types';

Chart.register(MatrixController, MatrixElement);

@Component({
  selector: 'app-stats-heatmap-family',
  hostDirectives: [StatsChartJsHostDirective],
  imports: [AppSelectComponent, BaseChartDirective, StatsChartCardComponent],
  templateUrl: './stats-heatmap-family.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class StatsHeatmapFamilyComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly chart = input.required<StatsHeatmapFamilyChart>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly yearChange = output<number>();

  protected readonly chartType = 'matrix' as const;
  protected readonly sessionChart = computed(() => {
    const chart = this.chart();
    return chart.kind === 'session-calendar' ? chart : null;
  });
  protected readonly presentation = computed<StatsHeatmapPresentation>(() => {
    const chart = this.chart();
    const locale = this.activeLanguage();
    const translate = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    return chart.kind === 'reading-months'
      ? presentReadingMonths(chart.stats, locale, translate)
      : presentSessionCalendar(chart.stats.calendar, chart.stats.streaks, locale, translate);
  });
  protected readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.presentation().hasData ? 'ready' : 'empty';
  });
  protected readonly yearOptions = computed<readonly SelectOption<number>[]>(() => {
    const chart = this.sessionChart();
    if (!chart) return [];
    const years = new Set(chart.yearOptions);
    years.add(chart.year);
    return Array.from(years).sort((left, right) => right - left)
      .map((year) => ({ value: year, label: String(year) }));
  });
  protected readonly yearSelectorLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.sessionHeatmap.selectYear');
  });

  protected readonly chartData = computed<ChartData<'matrix', StatsHeatmapDatum[], string>>(() => {
    const presentation = this.presentation();
    const readingMonths = presentation.kind === 'reading-months';
    return {
      labels: [],
      datasets: [{
        label: presentation.seriesLabel,
        data: presentation.cells.map((cell) => ({ ...cell })),
        backgroundColor: (context) => {
          const point = context.raw as StatsHeatmapDatum | undefined;
          if (!point?.v) return readStatsChartThemeColors().grid;
          const intensity = point.v / presentation.maximumValue;
          return readingMonths
            ? `rgba(239, 71, 111, ${Math.max(0.2, Math.min(1, intensity * 0.8 + 0.2))})`
            : `rgba(59, 130, 246, ${Math.max(0.3, Math.min(0.9, intensity * 0.6 + 0.3))})`;
        },
        borderWidth: 1,
        ...(readingMonths ? {
          width: ({ chart }) => chart.chartArea.width / 12 - 1,
          height: ({ chart }) => chart.chartArea.height / presentation.axisLabels.length - 1,
        } : {}),
      }],
    };
  });

  protected readonly chartOptions = computed<ChartConfiguration<'matrix'>['options']>(() => {
    const presentation = this.presentation();
    return presentation.kind === 'reading-months'
      ? this.readingMonthOptions(presentation)
      : this.sessionCalendarOptions(presentation);
  });

  protected onYearChange(year: number | null): void {
    if (year !== null) this.yearChange.emit(year);
  }

  private readingMonthOptions(
    presentation: StatsHeatmapPresentation,
  ): NonNullable<ChartConfiguration<'matrix'>['options']> {
    return {
      layout: { padding: { top: 20 } },
      plugins: { tooltip: {
        borderColor: '#ef476f', borderWidth: 2, cornerRadius: 8,
        displayColors: false, padding: 16,
        titleFont: { size: 14, weight: 'bold' as const }, bodyFont: { size: 13 },
        callbacks: {
          title: (context) => {
            const point = context[0]?.raw as StatsHeatmapDatum | undefined;
            return point ? `${presentation.monthLabels[point.x]} ${presentation.axisLabels[point.y]}` : '';
          },
          label: (context) => (context.raw as StatsHeatmapDatum).tooltipLabel,
        },
      } },
      scales: {
        x: {
          type: 'linear' as const, position: 'bottom' as const,
          ticks: {
            stepSize: 1,
            callback: (value) => presentation.monthLabels[value as number] ?? '',
            font: { family: "'Inter', sans-serif", size: 11 },
          },
          grid: { display: false },
        },
        y: {
          type: 'linear' as const, offset: true, max: presentation.axisLabels.length - 1,
          ticks: {
            stepSize: 1,
            callback: (value) => presentation.axisLabels[value as number] ?? '',
            font: { family: "'Inter', sans-serif", size: 11 },
          },
          grid: { display: false },
        },
      },
    };
  }

  private sessionCalendarOptions(
    presentation: StatsHeatmapPresentation,
  ): NonNullable<ChartConfiguration<'matrix'>['options']> {
    const locale = this.activeLanguage();
    return {
      layout: { padding: { top: 20, bottom: 20, left: 10, right: 10 } },
      plugins: { tooltip: {
        displayColors: false,
        titleFont: { size: 14, weight: 'bold' as const }, bodyFont: { size: 13 },
        callbacks: {
          title: (context) => new Intl.DateTimeFormat(locale, {
            timeZone: 'UTC', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
          }).format(Date.parse((context[0].raw as StatsHeatmapDatum).date ?? '')),
          label: (context) => (context.raw as StatsHeatmapDatum).tooltipLabel,
        },
      } },
      scales: {
        x: {
          type: 'linear' as const, position: 'top' as const,
          min: 0, max: Math.max(0, presentation.monthLabels.length - 1),
          ticks: {
            stepSize: 4,
            callback: (value) => Number(value) % 4 === 0
              ? presentation.monthLabels.at(Number(value)) ?? '' : '',
          },
          grid: { display: false }, border: { display: false },
        },
        y: {
          type: 'linear' as const, min: 0, max: 6,
          ticks: {
            stepSize: 1,
            callback: (value) => presentation.axisLabels[value as number] ?? '',
          },
          border: { display: false },
        },
      },
    };
  }
}
