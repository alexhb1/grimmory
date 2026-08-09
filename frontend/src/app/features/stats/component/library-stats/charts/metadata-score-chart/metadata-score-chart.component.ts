import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { type MetadataScoreStats } from '../../../../data/library/metadata-score-stats';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

interface ScoreStats {
  readonly id: ScoreRangeKey;
  readonly range: string;
  readonly count: number;
  readonly color: string;
}

type ScoreChartData = ChartData<'doughnut', number[], string>;
type ScoreRangeKey = 'excellent' | 'good' | 'fair' | 'poor' | 'veryPoor';

const SCORE_RANGE_DEFS: { key: ScoreRangeKey; color: string }[] = [
  {key: 'excellent', color: '#16A34A'},
  {key: 'good', color: '#22C55E'},
  {key: 'fair', color: '#F59E0B'},
  {key: 'poor', color: '#F97316'},
  {key: 'veryPoor', color: '#DC2626'}
];

@Component({
  selector: 'app-metadata-score-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [
    BaseChartDirective,
    StatsChartCardComponent,
    TranslocoDirective,
  ],
  templateUrl: './metadata-score-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class MetadataScoreChartComponent {
  private readonly t = inject(TranslocoService);

  readonly stats = input.required<MetadataScoreStats>();
  readonly loading = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  public readonly chartType = 'doughnut' as const;
  public readonly scoreStats = computed<ScoreStats[]>(() => this.stats().buckets
    .filter(bucket => bucket.bookCount > 0)
    .map(bucket => ({
      id: bucket.id,
      range: this.t.translate(`statsLibrary.metadataScore.${bucket.id}`),
      count: bucket.bookCount,
      color: SCORE_RANGE_DEFS.find(range => range.key === bucket.id)?.color ?? '#6B7280',
    })));
  public readonly totalBooks = computed(() => this.stats().totalBooks);
  readonly state = computed<StatsChartState>(() => {
    if (this.loading()) return 'loading';
    return this.totalBooks() > 0 ? 'ready' : 'empty';
  });

  public readonly chartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    layout: {
      padding: {top: 10, bottom: 10}
    },
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          font: {family: "'Inter', sans-serif", size: 12},
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 15,
        },
      },
      tooltip: {
        enabled: true,
        borderColor: '#16A34A',
        borderWidth: 2,
        cornerRadius: 8,
        padding: 12,
        titleFont: {size: 13, weight: 'bold'},
        bodyFont: {size: 11},
        callbacks: {
          label: (context) => {
            const value = context.parsed;
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return this.t.translate('statsLibrary.metadataScore.tooltipLabel', {value, percentage});
          }
        }
      }
    }
  };

  public readonly chartData = computed<ScoreChartData>(() => {
    const stats = this.scoreStats();
    if (stats.length === 0) {
      return {labels: [], datasets: []};
    }

    const labels = stats.map(s => s.range);
    const data = stats.map(s => s.count);
    const colors = stats.map(s => s.color);

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: colors
      }]
    };
  });

}
