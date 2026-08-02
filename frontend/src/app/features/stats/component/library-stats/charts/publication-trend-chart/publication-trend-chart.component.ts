import {Component, computed, inject, input} from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import {BaseChartDirective} from 'ng2-charts';
import {ChartConfiguration, ChartData} from 'chart.js';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {PublicationTrendStats} from '../../../../data/library/publication-trend-stats';

interface TrendInsights {
  peakYear: number;
  peakYearCount: number;
  booksLast10Years: number;
  booksLast10YearsPercent: number;
  averageBooksPerYear: number;
  mostProductiveSpan: string;
  // Additional insights
  timeSpan: number;
  classicBooks: number;
  classicBooksPercent: number;
  century21Books: number;
  century21Percent: number;
  uniqueYears: number;
  oldestDecade: string;
  newestDecade: string;
}

type TrendChartData = ChartData<'line', number[], string>;

@Component({
  selector: 'app-publication-trend-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, TranslocoDirective],
  templateUrl: './publication-trend-chart.component.html',
  styleUrls: ['./publication-trend-chart.component.scss']
})
export class PublicationTrendChartComponent {
  private readonly t = inject(TranslocoService);

  readonly stats = input.required<PublicationTrendStats>();
  readonly loading = input(false);

  public readonly chartType = 'line' as const;
  public chartOptions: ChartConfiguration<'line'>['options'];
  public readonly insights = computed(() => {
    const stats = this.stats();
    const insights = stats.insights;
    if (!insights) return null;

    return {
      peakYear: insights.peakYear?.year ?? 0,
      peakYearCount: insights.peakYear?.bookCount ?? 0,
      booksLast10Years: insights.recentBookCount,
      booksLast10YearsPercent: insights.recentPercent,
      averageBooksPerYear: insights.averageBooksPerActiveYear,
      mostProductiveSpan: insights.busiestSpan
        ? `${insights.busiestSpan.startYear}-${insights.busiestSpan.endYear}`
        : 'N/A',
      timeSpan: insights.yearSpan,
      classicBooks: insights.classicBookCount,
      classicBooksPercent: insights.classicPercent,
      century21Books: insights.modernBookCount,
      century21Percent: insights.modernPercent,
      uniqueYears: insights.activeYearCount,
      oldestDecade: this.decadeLabel(stats.firstYear),
      newestDecade: this.decadeLabel(stats.lastYear),
    } satisfies TrendInsights;
  });
  public readonly totalBooks = computed(() => this.stats().totalBooks);
  public readonly yearRange = computed(() => this.stats().firstYear == null
    ? ''
    : `${this.stats().firstYear} - ${this.stats().lastYear}`);
  public readonly chartData = computed<TrendChartData>(() => {
    const years = this.stats().years;
    if (years.length === 0) {
      return {labels: [], datasets: []};
    }

    return {
      labels: years.map(year => year.year.toString()),
      datasets: [{
        data: years.map(year => year.bookCount),
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        pointBackgroundColor: '#06b6d4',
        fill: true
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
      layout: {
        padding: {top: 20, right: 20, bottom: 10, left: 10}
      },
      scales: {
        x: {
          ticks: {
            font: {
              family: "'Inter', sans-serif",
              size: 10
            },
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 20
          },
          grid: {
          },
          border: {display: false},
          title: {
            display: true,
            text: this.t.translate('statsLibrary.publicationTrend.axisPublicationYear'),
            font: {
              family: "'Inter', sans-serif",
              size: 12,
              weight: 500
            }
          }
        },
        y: {
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
            text: this.t.translate('statsLibrary.publicationTrend.axisBooks'),
            font: {
              family: "'Inter', sans-serif",
              size: 12,
              weight: 500
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          borderColor: '#06b6d4',
          borderWidth: 2,
          cornerRadius: 8,
          padding: 12,
          titleFont: {size: 13, weight: 'bold'},
          bodyFont: {size: 11},
          callbacks: {
            title: (context) => this.t.translate('statsLibrary.publicationTrend.tooltipTitle', {year: context[0].label}),
            label: (context) => {
              const value = context.parsed.y;
              return value === 1
                ? this.t.translate('statsLibrary.publicationTrend.tooltipBook', {value})
                : this.t.translate('statsLibrary.publicationTrend.tooltipBooks', {value});
            }
          }
        }
      },
      elements: {
        line: {
          tension: 0.3,
          borderWidth: 3
        },
        point: {
          radius: 4,
          hoverRadius: 7,
          borderWidth: 2
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    };
  }

  private decadeLabel(year: number | null): string {
    if (year == null) return '';
    return year < 1900 ? 'Pre-1900' : `${Math.floor(year / 10) * 10}s`;
  }
}
