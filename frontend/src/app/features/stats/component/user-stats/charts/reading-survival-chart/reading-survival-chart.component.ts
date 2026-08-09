import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { type ReadingSurvivalStats } from '../../../../data/user/reading-survival-stats';

type ReadingSurvivalChartData = ChartData<'line', number[], string>;

const CHART_FONT_FAMILY = "'Inter', sans-serif";
const SURVIVAL_COLOR = '#e91e63';

@Component({
  selector: 'app-reading-survival-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './reading-survival-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadingSurvivalChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<ReadingSurvivalStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'line' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalStarted > 0 ? 'ready' : 'empty';
  });
  readonly medianDropoutLabel = computed(() => {
    const median = this.stats().medianDropout;
    if (!median) return '100%+';
    return median.from === median.to ? `${median.to}%` : `${median.from}-${median.to}%`;
  });
  readonly dangerZoneLabel = computed(() => {
    const dangerZone = this.stats().dangerZone;
    return dangerZone ? `${dangerZone.from}-${dangerZone.to}%` : '—';
  });
  readonly dangerZoneDropLabel = computed(() => {
    const dangerZone = this.stats().dangerZone;
    return dangerZone ? `-${dangerZone.dropPercent.toFixed(0)}%` : '';
  });

  readonly chartData = computed<ReadingSurvivalChartData>(() => {
    this.activeLanguage();
    const points = this.stats().points;

    return {
      labels: points.map((point) => `${point.threshold}%`),
      datasets: [
        {
          label: this.transloco.translate('statsUser.readingSurvival.survivalRate'),
          data: points.map((point) => point.survivalPercent),
          borderColor: SURVIVAL_COLOR,
          backgroundColor: 'rgba(233, 30, 99, 0.15)',
          fill: true,
          stepped: true,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: SURVIVAL_COLOR,
          pointBorderWidth: 2,
          borderWidth: 2,
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    this.activeLanguage();

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, bottom: 10, left: 10, right: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderColor: SURVIVAL_COLOR,
          borderWidth: 1,
          cornerRadius: 6,
          padding: 12,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            title: (context) =>
              this.transloco.translate('statsUser.readingSurvival.tooltipProgress', {
                label: context[0].label,
              }),
            label: (context) =>
              this.transloco.translate('statsUser.readingSurvival.tooltipSurvival', {
                value: (context.parsed.y ?? 0).toFixed(1),
              }),
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.readingSurvival.axisProgressThreshold'),
            font: { family: CHART_FONT_FAMILY, size: 12, weight: 'bold' },
          },
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 } },
          border: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.readingSurvival.axisBooksSurviving'),
            font: { family: CHART_FONT_FAMILY, size: 12, weight: 'bold' },
          },
          ticks: {
            font: { family: CHART_FONT_FAMILY, size: 11 },
            callback: (value) => `${value}%`,
          },
          border: { display: false },
        },
      },
    };
  });

  protected formatCount(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }
}
