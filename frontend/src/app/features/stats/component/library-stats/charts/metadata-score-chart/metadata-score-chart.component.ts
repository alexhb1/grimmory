import {Component, computed, inject, input} from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import {BaseChartDirective} from 'ng2-charts';
import {ChartConfiguration, ChartData} from 'chart.js';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {MetadataScoreStats} from '../../../../data/library/metadata-score-stats';

interface ScoreStats {
  range: string;
  count: number;
  color: string;
}

type ScoreChartData = ChartData<'doughnut', number[], string>;
type ScoreRangeKey = 'excellent' | 'good' | 'fair' | 'poor' | 'veryPoor';

const SCORE_RANGE_DEFS: { key: ScoreRangeKey; min: number; max: number; color: string }[] = [
  {key: 'excellent', min: 90, max: 100, color: '#16A34A'},
  {key: 'good', min: 70, max: 89, color: '#22C55E'},
  {key: 'fair', min: 50, max: 69, color: '#F59E0B'},
  {key: 'poor', min: 25, max: 49, color: '#F97316'},
  {key: 'veryPoor', min: 0, max: 24, color: '#DC2626'}
];

@Component({
  selector: 'app-metadata-score-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, TranslocoDirective],
  templateUrl: './metadata-score-chart.component.html',
  styleUrls: ['./metadata-score-chart.component.scss']
})
export class MetadataScoreChartComponent {
  private readonly t = inject(TranslocoService);

  readonly stats = input.required<MetadataScoreStats>();
  readonly loading = input(false);

  public readonly chartType = 'doughnut' as const;
  public readonly scoreStats = computed<ScoreStats[]>(() => this.stats().buckets
    .filter(bucket => bucket.bookCount > 0)
    .map(bucket => ({
      range: this.t.translate(`statsLibrary.metadataScore.${bucket.id}`),
      count: bucket.bookCount,
      color: SCORE_RANGE_DEFS.find(range => range.key === bucket.id)?.color ?? '#6B7280',
    })));
  public readonly totalBooks = computed(() => this.stats().totalBooks);
  public readonly averageScore = computed(() => this.stats().averageScore ?? 0);

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
          font: {
            family: "'Inter', sans-serif",
            size: 11
          },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 12,
          boxWidth: 8
        }
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
