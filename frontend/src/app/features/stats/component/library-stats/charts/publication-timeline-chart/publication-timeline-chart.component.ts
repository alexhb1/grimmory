import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import {BaseChartDirective} from 'ng2-charts';
import {ChartConfiguration, ChartData} from 'chart.js';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {
  PRE_1900_DECADE_START,
  PublicationTimelineStats,
} from '../../../../data/library/publication-timeline-stats';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';

type TimelineChartData = ChartData<'bar', number[], string>;

// Color gradient from warm (old) to cool (new)
const DECADE_COLORS: Record<string, string> = {
  'pre1900': '#92400e',
  '1900s': '#b45309',
  '1910s': '#c2410c',
  '1920s': '#d97706',
  '1930s': '#e5932d',
  '1940s': '#eab308',
  '1950s': '#a3e635',
  '1960s': '#4ade80',
  '1970s': '#22d3ee',
  '1980s': '#38bdf8',
  '1990s': '#60a5fa',
  '2000s': '#818cf8',
  '2010s': '#a78bfa',
  '2020s': '#c084fc'
};

@Component({
  selector: 'app-publication-timeline-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './publication-timeline-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class PublicationTimelineChartComponent {
  private readonly t = inject(TranslocoService);

  readonly stats = input.required<PublicationTimelineStats>();
  readonly loading = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  public readonly chartType = 'bar' as const;
  public chartOptions: ChartConfiguration<'bar'>['options'];
  readonly state = computed<StatsChartState>(() => {
    if (this.loading()) return 'loading';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });
  public readonly chartData = computed<TimelineChartData>(() => {
    const stats = this.stats().decades;
    if (stats.length === 0) {
      return {labels: [], datasets: []};
    }

    const labels = stats.map(s => this.decadeLabel(s.decadeStart));
    const data = stats.map(s => s.bookCount);
    const colors = stats.map(s => DECADE_COLORS[this.decadeKey(s.decadeStart)] ?? '#6B7280');

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.8,
        categoryPercentage: 0.85
      }]
    };
  });

  constructor() {
    this.initChartOptions();
  }

  private initChartOptions(): void {
    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      layout: {
        padding: {top: 10, right: 20, bottom: 10, left: 10}
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            font: {
              family: "'Inter', sans-serif",
              size: 11
            },
            precision: 0,
            stepSize: 1
          },
          grid: {
          },
          border: {display: false},
          title: {
            display: true,
            text: this.t.translate('statsLibrary.publicationTimeline.axisNumberOfBooks'),
            font: {
              family: "'Inter', sans-serif",
              size: 12,
              weight: 500
            }
          }
        },
        y: {
          ticks: {
            font: {
              family: "'Inter', sans-serif",
              size: 11
            }
          },
          grid: {
            display: false
          },
          border: {display: false}
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          borderColor: '#a78bfa',
          borderWidth: 2,
          cornerRadius: 8,
          padding: 12,
          titleFont: {size: 13, weight: 'bold'},
          bodyFont: {size: 11},
          callbacks: {
            label: (context) => {
              const value = context.parsed.x;
              return value === 1
                ? this.t.translate('statsLibrary.publicationTimeline.tooltipBook', {value})
                : this.t.translate('statsLibrary.publicationTimeline.tooltipBooks', {value});
            }
          }
        }
      }
    };
  }

  private decadeKey(decadeStart: number): string {
    if (decadeStart < 1900) return 'pre1900';
    if (decadeStart >= 2020) return '2020s';
    return `${decadeStart}s`;
  }

  protected decadeLabel(decadeStart: number): string {
    return decadeStart === PRE_1900_DECADE_START ? 'Pre-1900' : `${decadeStart}s`;
  }

  protected formatCount(value: number): string {
    return value.toLocaleString(this.t.getActiveLang());
  }

  protected formatPercent(value: number): string {
    return new Intl.NumberFormat(this.t.getActiveLang(), { style: 'percent' }).format(value / 100);
  }

  protected titleOrUnknown(title: string | null | undefined): string {
    return title || this.t.translate('statsLibrary.publicationTimeline.unknownTitle');
  }
}
