import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type ChartData, type ChartOptions, type TooltipItem } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { StatsChartJsHostDirective } from './stats-chart-js-host.directive';

export interface StatsBarCategory {
  readonly label: string;
  readonly axisLabel?: string;
  readonly tooltipTitle?: string;
}

export interface StatsBarDatum {
  readonly value: number;
  readonly tooltipLines: readonly string[];
  readonly color?: string;
  readonly borderColor?: string;
}

export interface StatsBarSeries {
  readonly label: string;
  readonly color: string;
  readonly borderColor?: string;
  readonly axis?: 'primary' | 'secondary';
  readonly values: readonly StatsBarDatum[];
}

export interface StatsBarValueAxis {
  readonly title: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly stepSize?: number;
  readonly precision?: number;
  readonly maxTicks?: number;
  readonly position?: 'left' | 'right';
  readonly titleColor?: string;
  readonly formatTick?: (value: number) => string;
  readonly drawGrid?: boolean;
}

export interface StatsCategoricalBarPlot {
  readonly categories: readonly StatsBarCategory[];
  readonly series: readonly StatsBarSeries[];
  readonly primaryAxis: StatsBarValueAxis;
  readonly secondaryAxis?: StatsBarValueAxis;
  readonly orientation?: 'vertical' | 'horizontal';
  readonly categoryAxisTitle?: string;
  readonly categoryPercentage?: 0.6 | 0.7 | 0.85;
  readonly padding?: number | { readonly top?: number; readonly right?: number; readonly bottom?: number; readonly left?: number };
  readonly axisStyle?: 'library-compact' | 'library-horizontal' | 'regular' | 'regular-inter' | 'strong';
  readonly verticalCategoryLabels?: boolean;
  readonly tooltipStyle?:
    | { readonly kind: 'standard' }
    | { readonly kind: 'compact-accent'; readonly accent: string }
    | { readonly kind: 'rich-accent'; readonly accent: string };
}

@Component({
  selector: 'app-stats-categorical-bar',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective],
  template: `
    <div class="relative min-w-0" [style.height.px]="height()">
      <canvas baseChart type="bar" [data]="chartData()" [options]="chartOptions()"></canvas>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class StatsCategoricalBarComponent {
  readonly plot = input.required<StatsCategoricalBarPlot>();
  readonly height = input(260);

  readonly chartData = computed<ChartData<'bar', number[], string>>(() => {
    const plot = this.plot();
    return {
      labels: plot.categories.map((category) => category.label),
      datasets: plot.series.map((series) => ({
        label: series.label,
        data: series.values.map((datum) => datum.value),
        backgroundColor: series.values.some((datum) => datum.color)
          ? series.values.map((datum) => datum.color ?? series.color)
          : series.color,
        ...(series.borderColor || series.values.some((datum) => datum.borderColor)
          ? {
              borderColor: series.values.some((datum) => datum.borderColor)
                ? series.values.map((datum) => datum.borderColor ?? series.borderColor)
                : series.borderColor,
            }
          : {}),
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.8,
        categoryPercentage: plot.categoryPercentage ?? 0.6,
        ...(series.axis === 'secondary'
          ? (plot.orientation === 'horizontal' ? { xAxisID: 'x1' } : { yAxisID: 'y1' })
          : {}),
      })),
    };
  });

  readonly chartOptions = computed<ChartOptions<'bar'>>(() => {
    const plot = this.plot();
    const horizontal = plot.orientation === 'horizontal';
    const categoryAxis = this.categoryAxis(plot);
    const primaryAxis = this.valueAxis(plot.primaryAxis, plot.axisStyle ?? 'regular');
    const secondaryAxis = plot.secondaryAxis
      ? this.valueAxis(plot.secondaryAxis, plot.axisStyle ?? 'regular')
      : undefined;

    return {
      ...(horizontal ? { indexAxis: 'y' as const } : {}),
      layout: { padding: plot.padding ?? 10 },
      plugins: { tooltip: this.tooltipOptions(plot) },
      scales: horizontal
        ? { x: primaryAxis, y: categoryAxis, ...(secondaryAxis ? { x1: secondaryAxis } : {}) }
        : { x: categoryAxis, y: primaryAxis, ...(secondaryAxis ? { y1: secondaryAxis } : {}) },
    };
  });

  private categoryAxis(plot: StatsCategoricalBarPlot) {
    const fonts = axisFonts(plot.axisStyle ?? 'regular');
    const hasAxisLabels = plot.categories.some((category) => category.axisLabel !== undefined);
    return {
      title: plot.categoryAxisTitle
        ? { display: true, text: plot.categoryAxisTitle, font: fonts.title }
        : undefined,
      ticks: {
        font: fonts.ticks,
        ...(plot.verticalCategoryLabels ? { maxRotation: 90, minRotation: 90 } : {}),
        ...(hasAxisLabels
          ? { callback: (_value: string | number, index: number) => plot.categories[index]?.axisLabel ?? plot.categories[index]?.label ?? '' }
          : {}),
      },
      grid: { display: false },
      border: { display: false },
    };
  }

  private valueAxis(axis: StatsBarValueAxis, style: NonNullable<StatsCategoricalBarPlot['axisStyle']>) {
    const fonts = axisFonts(style);
    return {
      beginAtZero: axis.minimum === undefined,
      min: axis.minimum,
      max: axis.maximum,
      position: axis.position,
      title: {
        display: true,
        text: axis.title,
        color: axis.titleColor,
        font: fonts.title,
      },
      ticks: {
        font: fonts.ticks,
        stepSize: axis.stepSize,
        precision: axis.precision,
        maxTicksLimit: axis.maxTicks,
        callback: axis.formatTick ? (value: string | number) => axis.formatTick?.(Number(value)) : undefined,
      },
      grid: axis.drawGrid === false ? { drawOnChartArea: false } : undefined,
      border: { display: false },
    };
  }

  private tooltipOptions(plot: StatsCategoricalBarPlot) {
    const style = plot.tooltipStyle ?? { kind: 'standard' as const };
    const fontFamily = "'Inter', sans-serif";
    return {
      ...(style.kind === 'standard'
        ? { titleFont: { family: fontFamily, size: 14, weight: 'bold' as const }, bodyFont: { family: fontFamily, size: 13 } }
        : {}),
      ...(style.kind === 'compact-accent'
        ? { borderColor: style.accent, borderWidth: 2, cornerRadius: 8, titleFont: { family: fontFamily, size: 13, weight: 'bold' as const }, bodyFont: { family: fontFamily, size: 11 } }
        : {}),
      ...(style.kind === 'rich-accent'
        ? { borderColor: style.accent, borderWidth: 2, cornerRadius: 8, displayColors: false, padding: 16, titleFont: { family: fontFamily, size: 14, weight: 'bold' as const }, bodyFont: { family: fontFamily, size: 13 } }
        : {}),
      callbacks: {
        title: (items: TooltipItem<'bar'>[]) => {
          const category = plot.categories[items[0]?.dataIndex ?? -1];
          return category?.tooltipTitle ?? category?.label ?? '';
        },
        label: (item: TooltipItem<'bar'>) => [
          ...(plot.series[item.datasetIndex]?.values[item.dataIndex]?.tooltipLines ?? []),
        ],
      },
    };
  }
}

function axisFonts(style: NonNullable<StatsCategoricalBarPlot['axisStyle']>) {
  switch (style) {
    case 'library-compact':
      return { title: { family: "'Inter', sans-serif", size: 11 }, ticks: { family: "'Inter', sans-serif", size: 10 } };
    case 'library-horizontal':
      return { title: { family: "'Inter', sans-serif", size: 12, weight: 500 as const }, ticks: { family: "'Inter', sans-serif" } };
    case 'regular-inter':
      return { title: { family: "'Inter', sans-serif", size: 12 }, ticks: { family: "'Inter', sans-serif" } };
    case 'strong':
      return { title: { size: 13, weight: 'bold' as const }, ticks: {} };
    default:
      return { title: { size: 12 }, ticks: {} };
  }
}
