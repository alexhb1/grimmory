import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { type ChartData, type ChartOptions, type ScatterDataPoint } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';
import { StatsChartLegendComponent } from '../../../shared/stats-chart-legend.component';
import { presentBookLength } from './book-length.presenter';
import { presentRatingTaste } from './rating-taste.presenter';
import { presentSessionArchetypes } from './session-archetypes.presenter';
import {
  type StatsPointFamilyChart,
  type StatsPointFamilyDatum,
  type StatsPointFamilyPresentation,
} from './stats-point-family.types';

type PointDatum = ScatterDataPoint & StatsPointFamilyDatum;

@Component({
  selector: 'app-stats-point-family',
  hostDirectives: [StatsChartJsHostDirective],
  imports: [AppSelectComponent, BaseChartDirective, StatsChartCardComponent, StatsChartLegendComponent],
  templateUrl: './stats-point-family.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class StatsPointFamilyComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly chart = input.required<StatsPointFamilyChart>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly yearChange = output<number>();

  protected readonly chartType = 'scatter' as const;
  protected readonly presentation = computed<StatsPointFamilyPresentation>(() => {
    const locale = this.activeLanguage();
    const translate = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    const chart = this.chart();
    switch (chart.kind) {
      case 'book-length': return presentBookLength(chart.stats, locale, translate);
      case 'rating-taste': return presentRatingTaste(chart.stats, locale, translate);
      case 'session-archetypes': return presentSessionArchetypes(chart.stats, locale, translate);
    }
  });
  protected readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.presentation().hasData ? 'ready' : 'empty';
  });
  protected readonly sessionChart = computed(() => {
    const chart = this.chart();
    return chart.kind === 'session-archetypes' ? chart : null;
  });
  protected readonly yearOptions = computed<readonly SelectOption<number>[]>(() =>
    this.sessionChart()?.yearOptions.map((year) => ({ value: year, label: String(year) })) ?? [],
  );
  protected readonly yearSelectorLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.peakHours.selectYear');
  });
  protected readonly summaryClass = computed(() => {
    const columns = this.chart().kind === 'book-length'
      ? 'sm:grid-cols-3'
      : this.chart().kind === 'rating-taste' ? 'sm:grid-cols-4' : '';
    return `grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border pt-4 ${columns}`;
  });

  protected readonly chartData = computed<ChartData<'scatter', PointDatum[], string>>(() => {
    const presentation = this.presentation();
    const session = presentation.kind === 'session-archetypes';
    return {
      datasets: presentation.series.map((series) => ({
        label: series.label,
        data: series.points.map((point) => ({ ...point })),
        backgroundColor: series.fillColor,
        borderColor: series.borderColor,
        pointRadius: session ? 5 : 6,
        pointHoverRadius: session ? 8 : 9,
        ...(session ? { borderWidth: 1 } : { pointBorderWidth: 2 }),
      })),
    };
  });

  protected readonly chartOptions = computed<ChartOptions<'scatter'>>(() => {
    const presentation = this.presentation();
    switch (presentation.kind) {
      case 'book-length': return this.ratedBookOptions(presentation, false);
      case 'rating-taste': return this.ratedBookOptions(presentation, true);
      case 'session-archetypes': return this.sessionOptions(presentation);
    }
  });

  protected onYearChange(year: number | null): void {
    if (year !== null) this.yearChange.emit(year);
  }

  private ratedBookOptions(
    presentation: StatsPointFamilyPresentation,
    comparison: boolean,
  ): ChartOptions<'scatter'> {
    const font = { family: "'Inter', sans-serif", size: 11 };
    const bounds = comparison ? { min: 0, max: 5 } : {};
    const titleFont = { family: font.family, size: 12, weight: comparison ? 500 as const : 'bold' as const };
    return {
      layout: { padding: comparison
        ? { top: 20, right: 20, bottom: 10, left: 10 }
        : { top: 10, right: 20, bottom: 10, left: 10 } },
      scales: {
        x: {
          ...bounds,
          title: { display: true, text: presentation.xAxisLabel, font: titleFont },
          ticks: { ...(comparison ? { stepSize: 1 } : {}), font },
          ...(comparison ? { grid: { drawTicks: true } } : {}),
        },
        y: {
          min: 0,
          max: comparison ? 5 : 10,
          title: { display: true, text: presentation.yAxisLabel, font: titleFont },
          ticks: { stepSize: 1, font },
          ...(comparison ? { grid: { drawTicks: true } } : {}),
        },
      },
      plugins: {
        tooltip: {
          borderColor: comparison ? '#9c27b0' : '#00bcd4',
          borderWidth: 2,
          cornerRadius: 8,
          titleFont: { family: font.family, size: 13, weight: 'bold' },
          bodyFont: font,
          callbacks: {
            title: (context) => (context[0].raw as PointDatum).tooltipTitle ?? '',
            label: (context) => [...((context.raw as PointDatum).tooltipLines ?? [])],
          },
        },
      },
      elements: { point: { radius: 6, hoverRadius: 9, borderWidth: 2 } },
    };
  }

  private sessionOptions(presentation: StatsPointFamilyPresentation): ChartOptions<'scatter'> {
    const locale = this.activeLanguage();
    return {
      animation: { duration: 400 },
      layout: { padding: { top: 10, right: 20 } },
      plugins: { tooltip: {
        padding: 10,
        callbacks: { label: (context) => {
          const hourOfDay = context.parsed.x ?? 0;
          const hour = Math.floor(hourOfDay);
          const minute = Math.round((hourOfDay - hour) * 60);
          return `${context.dataset.label}: ${hour}:${String(minute).padStart(2, '0')} - ${Math.round(context.parsed.y ?? 0)} min`;
        } },
      } },
      scales: {
        x: {
          min: 0, max: 24,
          ticks: {
            font: { size: 10 }, stepSize: 3,
            callback: (value) => new Date(2000, 0, 1, Number(value) % 24)
              .toLocaleTimeString(locale, { hour: 'numeric' }),
          },
          title: { display: true, text: presentation.xAxisLabel, font: { size: 11 } },
        },
        y: {
          min: 0,
          title: { display: true, text: presentation.yAxisLabel, font: { size: 11 } },
        },
      },
    };
  }
}
