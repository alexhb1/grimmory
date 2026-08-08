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
import { type PublicationEraStats } from '../../../../data/user/publication-era-stats';

interface PublicationEraLegendEntry {
  readonly label: string;
  readonly color: string;
}

const DECADE_COLORS: readonly string[] = [
  '#e91e63',
  '#9c27b0',
  '#673ab7',
  '#3f51b5',
  '#2196f3',
  '#00bcd4',
  '#009688',
  '#4caf50',
  '#8bc34a',
  '#ff9800',
];

@Component({
  selector: 'app-publication-era-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './publication-era-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class PublicationEraChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<PublicationEraStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'line' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().decades.length > 0 ? 'ready' : 'empty';
  });

  readonly legend = computed<readonly PublicationEraLegendEntry[]>(() =>
    this.stats().decades.map((decade, index) => ({
      label: decade.label,
      color: DECADE_COLORS[index % DECADE_COLORS.length],
    })),
  );

  readonly chartData = computed<ChartData<'line', number[], string>>(() => {
    const { decades, ratingBucketLabels } = this.stats();

    return {
      labels: [...ratingBucketLabels],
      datasets: decades.map((decade, index) => {
        const color = DECADE_COLORS[index % DECADE_COLORS.length];

        return {
          label: decade.label,
          data: [...decade.bucketCounts],
          borderColor: color,
          backgroundColor: `${color}20`,
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: color,
          pointBorderWidth: 1.5,
          tension: 0.3,
          fill: false,
        };
      }),
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    this.activeLanguage();

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      layout: { padding: { top: 10, right: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          callbacks: {
            label: (context) => {
              const count = context.parsed.y ?? 0;
              const books = this.transloco.translate(
                count === 1
                  ? 'statsUser.personalRating.tooltipBook'
                  : 'statsUser.personalRating.tooltipBooks',
                { value: this.formatCount(count) },
              );

              return `${context.dataset.label}: ${books}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 11 } },
          title: {
            display: true,
            text: this.transloco.translate('statsUser.personalRating.axisPersonalRating'),
            font: { size: 11 },
          },
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 11 }, stepSize: 1 },
          title: {
            display: true,
            text: this.transloco.translate('statsUser.personalRating.axisNumberOfBooks'),
            font: { size: 11 },
          },
        },
      },
      interaction: { mode: 'index', intersect: false },
    };
  });

  protected formatCount(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }

  protected formatRating(value: number): string {
    return value.toLocaleString(this.activeLanguage(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
}
