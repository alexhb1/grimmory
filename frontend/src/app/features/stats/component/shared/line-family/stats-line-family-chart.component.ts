import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  type ChartConfiguration,
  type ChartData,
  type ScatterDataPoint,
  type TooltipItem,
} from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { AppSelectComponent } from '../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../shared/ui/select/app-select.options';
import { StatsChartCardComponent, type StatsChartState } from '../stats-chart-card.component';
import { StatsChartJsHostDirective } from '../stats-chart-js-host.directive';
import { StatsChartSummaryComponent } from '../stats-chart-summary.component';
import { buildCompletionRaceView } from './completion-race.presenter';
import { buildPeakHoursView } from './peak-hours.presenter';
import { buildPublicationEraView } from './publication-era.presenter';
import { buildPublicationTrendView } from './publication-trend.presenter';
import { buildReadingJourneyView } from './reading-journey.presenter';
import { buildReadingSurvivalView } from './reading-survival.presenter';
import {
  type LineAxis,
  type LineChartView,
  type LinePoint,
  type StatsLineFamilyChart,
} from './stats-line-family-chart.types';

type LineOptions = NonNullable<ChartConfiguration<'line'>['options']>;
type LineScale = NonNullable<LineOptions['scales']>[string];
type LineDatum = number | ScatterDataPoint;

const CHART_FONT_FAMILY = "'Inter', sans-serif";

const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

@Component({
  selector: 'app-stats-line-family-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [
    AppSelectComponent,
    BaseChartDirective,
    StatsChartCardComponent,
    StatsChartSummaryComponent,
    TranslocoPipe,
  ],
  templateUrl: './stats-line-family-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class StatsLineFamilyChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly chart = input.required<StatsLineFamilyChart>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly paramsChange = output<{ year: number | null; month: number | null }>();
  readonly yearChange = output<number>();

  readonly view = computed<LineChartView>(() => {
    const locale = this.activeLanguage();
    const context = {
      locale,
      translate: (key: string, params?: Record<string, unknown>) =>
        this.transloco.translate(key, params),
    };
    const chart = this.chart();
    switch (chart.kind) {
      case 'publication-trend': return buildPublicationTrendView(chart.stats, context);
      case 'reading-journey': return buildReadingJourneyView(chart.stats, context);
      case 'peak-hours': return buildPeakHoursView(chart.stats, context);
      case 'publication-era': return buildPublicationEraView(chart.stats, context);
      case 'completion-race': return buildCompletionRaceView(chart.stats, chart.year, context);
      case 'reading-survival': return buildReadingSurvivalView(chart.stats, context);
    }
  });

  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.view().hasData ? 'ready' : 'empty';
  });

  readonly yearOptions = computed<readonly SelectOption<number>[]>(() => {
    const chart = this.chart();
    return chart.kind === 'peak-hours' || chart.kind === 'completion-race'
      ? chart.yearOptions.map((year) => ({ value: year, label: String(year) }))
      : [];
  });

  readonly monthOptions = computed<readonly SelectOption<number>[]>(() => {
    this.activeLanguage();
    return MONTH_KEYS.map((key, index) => ({
      value: index + 1,
      label: this.transloco.translate(`statsUser.peakHours.${key}`),
    }));
  });

  readonly peakControls = computed(() => {
    const chart = this.chart();
    return chart.kind === 'peak-hours' ? { year: chart.year, month: chart.month } : null;
  });

  readonly raceYear = computed(() => {
    const chart = this.chart();
    return chart.kind === 'completion-race' ? chart.year : null;
  });

  readonly chartData = computed<ChartData<'line', LineDatum[], string>>(() => {
    const view = this.view();
    return {
      labels: view.labels ? [...view.labels] : undefined,
      datasets: view.series.map((series) => ({
        label: series.label,
        data: series.points.map((point) => point.x == null ? point.value : { x: point.x, y: point.value }),
        borderColor: series.color,
        backgroundColor: series.fillColor ?? series.color,
        pointBackgroundColor: series.color,
        yAxisID: series.axis,
        fill: series.fill,
        order: series.order,
        stepped: series.stepped,
        tension: series.tension,
        borderWidth: series.borderWidth,
        pointRadius: series.pointRadius,
        pointHoverRadius: series.pointHoverRadius,
        pointBorderWidth: series.pointBorderWidth,
      })),
    };
  });

  readonly chartOptions = computed<LineOptions>(() => {
    const view = this.view();
    const scales: NonNullable<LineOptions['scales']> = {
      x: this.axisOptions(view.xAxis),
    };
    view.yAxes.forEach((axis, index) => scales[index === 0 ? 'y' : 'y1'] = this.axisOptions(axis));

    return {
      ...(view.animationDuration == null ? {} : { animation: { duration: view.animationDuration } }),
      layout: { padding: this.layoutPadding(view.layout) },
      scales,
      plugins: { tooltip: {
        borderColor: view.tooltipAccent,
        borderWidth: view.tooltipBorderWidth,
        cornerRadius: view.tooltipCornerRadius,
        padding: view.tooltipPadding,
        titleFont: view.tooltipTitleSize
          ? { family: CHART_FONT_FAMILY, size: view.tooltipTitleSize, weight: 'bold' }
          : undefined,
        bodyFont: view.tooltipBodySize
          ? { family: CHART_FONT_FAMILY, size: view.tooltipBodySize }
          : undefined,
        callbacks: {
          title: (items) => this.tooltipPoint(items[0])?.tooltipTitle ?? items[0]?.label ?? '',
          label: (item) => [...(this.tooltipPoint(item)?.tooltipLines ?? [])],
          afterBody: (items) => [...(this.tooltipPoint(items[0])?.tooltipAfterBody ?? [])],
        },
      } },
      interaction: view.interaction ? { mode: view.interaction, intersect: false } : undefined,
    };
  });

  onYearChange(year: number | null): void {
    const chart = this.chart();
    if (chart.kind === 'peak-hours') this.paramsChange.emit({ year, month: chart.month });
    if (chart.kind === 'completion-race' && year !== null) this.yearChange.emit(year);
  }

  onMonthChange(month: number | null): void {
    const chart = this.chart();
    if (chart.kind === 'peak-hours') this.paramsChange.emit({ year: chart.year, month });
  }

  private tooltipPoint(item: TooltipItem<'line'> | undefined): LinePoint | undefined {
    if (!item) return undefined;
    return this.view().series.at(item.datasetIndex)?.points.at(item.dataIndex);
  }

  private axisOptions(axis: LineAxis): LineScale {
    return {
      type: axis.type,
      position: axis.position,
      beginAtZero: axis.beginAtZero,
      min: axis.minimum,
      max: axis.maximum,
      title: {
        display: true,
        text: axis.title,
        color: axis.titleColor,
        font: { family: CHART_FONT_FAMILY, size: axis.titleSize, weight: axis.titleWeight },
      },
      ticks: {
        font: { family: CHART_FONT_FAMILY, size: axis.tickSize },
        stepSize: axis.stepSize,
        precision: axis.precision,
        maxRotation: axis.rotation,
        minRotation: axis.rotation,
        maxTicksLimit: axis.maxTicks,
        autoSkipPadding: axis.autoSkipPadding,
        callback: axis.tickFormat === 'percent'
          ? (value: number | string) => `${value}%`
          : axis.tickFormat === 'minutes'
            ? (value: number | string) => `${typeof value === 'number' ? Math.round(value) : 0}m`
            : undefined,
      },
      grid: axis.drawOnChartArea === false ? { drawOnChartArea: false } : undefined,
      border: { display: axis.showBorder ?? false },
    } as unknown as LineScale;
  }

  private layoutPadding(layout: LineChartView['layout']): number | { top: number; right: number; bottom?: number; left?: number } {
    if (layout === 'library') return { top: 20, right: 20, bottom: 10, left: 10 };
    if (layout === 'top-right') return { top: 10, right: 10 };
    return 10;
  }
}
