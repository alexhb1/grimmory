import {Component, computed, inject, input} from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import {BaseChartDirective} from 'ng2-charts';
import {ChartConfiguration, ChartData} from 'chart.js';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {PageCountStats} from '../../../../data/library/page-count-stats';

type PageChartData = ChartData<'bar', number[], string>;

const PAGE_COLORS = [
  '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
] as const;

@Component({
  selector: 'app-page-count-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, TranslocoDirective],
  templateUrl: './page-count-chart.component.html',
  styleUrls: ['./page-count-chart.component.scss']
})
export class PageCountChartComponent {
  private readonly t = inject(TranslocoService);

  readonly stats = input.required<PageCountStats>();
  readonly loading = input(false);

  public readonly chartType = 'bar' as const;
  public readonly totalBooks = computed(() => this.stats().totalBooks);

  public readonly chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {top: 10, bottom: 10}
    },
    plugins: {
      legend: {display: false},
      tooltip: {
        enabled: true,
        borderColor: '#8B5CF6',
        borderWidth: 2,
        cornerRadius: 8,
        padding: 12,
        titleFont: {size: 13, weight: 'bold'},
        bodyFont: {size: 11},
        callbacks: {
          title: (context) => this.t.translate('statsLibrary.pageCount.tooltipTitle', {label: context[0].label}),
          label: (context) => {
            const value = context.parsed.y;
            return value === 1
              ? this.t.translate('statsLibrary.pageCount.tooltipLabel', {value})
              : this.t.translate('statsLibrary.pageCount.tooltipLabelPlural', {value});
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: this.t.translate('statsLibrary.pageCount.axisPageCount'),
          font: {
            family: "'Inter', sans-serif",
            size: 11
          }
        },
        ticks: {
          font: {
            family: "'Inter', sans-serif",
            size: 10
          }
        },
        grid: {display: false},
        border: {display: false}
      },
      y: {
        title: {
          display: true,
          text: this.t.translate('statsLibrary.pageCount.axisBooks'),
          font: {
            family: "'Inter', sans-serif",
            size: 11
          }
        },
        beginAtZero: true,
        ticks: {
          font: {
            family: "'Inter', sans-serif",
            size: 10
          },
          stepSize: 1,
          maxTicksLimit: 6
        },
        grid: {
        },
        border: {display: false}
      }
    }
  };

  public readonly chartData = computed<PageChartData>(() => {
    if (this.stats().totalBooks === 0) {
      return {labels: [], datasets: []};
    }

    const labels = this.stats().buckets.map(bucket => bucket.label);
    const data = this.stats().buckets.map(bucket => bucket.bookCount);
    return {
      labels,
      datasets: [{
        data,
        backgroundColor: PAGE_COLORS,
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.8,
        categoryPercentage: 0.7
      }]
    };
  });

}
