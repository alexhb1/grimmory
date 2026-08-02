import {Component, computed, inject, input} from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import {BaseChartDirective} from 'ng2-charts';
import {ChartConfiguration, ChartData} from 'chart.js';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {ReadingJourneyStats} from '../../../../data/library/reading-journey-stats';

interface MonthlyData {
  label: string;
  cumulativeAdded: number;
  cumulativeFinished: number;
}

interface JourneyInsights {
  totalAdded: number;
  totalFinished: number;
  currentBacklog: number;
  backlogPercent: number;
  avgTimeToFinishDays: number;
  mostProductiveMonth: string;
  mostProductiveCount: number;
  busiestAcquisitionMonth: string;
  busiestAcquisitionCount: number;
  finishRate: number;
  recentActivity: string;
  longestStreak: number;
}

type JourneyChartData = ChartData<'line', number[], string>;

@Component({
  selector: 'app-reading-journey-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, TranslocoDirective],
  templateUrl: './reading-journey-chart.component.html',
  styleUrls: ['./reading-journey-chart.component.scss']
})
export class ReadingJourneyChartComponent {
  private readonly t = inject(TranslocoService);

  readonly stats = input.required<ReadingJourneyStats>();
  readonly loading = input(false);
  private readonly monthlyData = computed<MonthlyData[]>(() => this.stats().months.map(month => ({
    label: this.formatMonthLabel(month.month),
    cumulativeAdded: month.cumulativeAdded,
    cumulativeFinished: month.cumulativeFinished,
  })));

  public readonly chartType = 'line' as const;
  public chartOptions: ChartConfiguration<'line'>['options'];
  public readonly insights = computed(() => {
    const insights = this.stats().insights;
    if (!insights) return null;

    return {
      totalAdded: insights.totalAdded,
      totalFinished: insights.totalFinished,
      currentBacklog: insights.currentBacklog,
      backlogPercent: insights.backlogPercent,
      avgTimeToFinishDays: insights.averageDaysToFinish ?? 0,
      mostProductiveMonth: insights.bestReadingMonth
        ? this.formatMonthLabel(insights.bestReadingMonth.month)
        : 'N/A',
      mostProductiveCount: insights.bestReadingMonth?.count ?? 0,
      busiestAcquisitionMonth: insights.peakAcquisitionMonth
        ? this.formatMonthLabel(insights.peakAcquisitionMonth.month)
        : 'N/A',
      busiestAcquisitionCount: insights.peakAcquisitionMonth?.count ?? 0,
      finishRate: insights.finishRate,
      recentActivity: insights.recentFinishedCount > 0
        ? this.t.translate('statsLibrary.readingJourney.recentActivityBooks', {
          count: insights.recentFinishedCount,
        })
        : this.t.translate('statsLibrary.readingJourney.recentActivityNone'),
      longestStreak: insights.longestReadingStreak,
    } satisfies JourneyInsights;
  });
  public readonly hasData = computed(() => this.monthlyData().length > 0);
  public readonly dateRange = computed(() => {
    const monthlyData = this.monthlyData();
    if (monthlyData.length === 0) {
      return '';
    }

    return `${monthlyData[0].label} - ${monthlyData[monthlyData.length - 1].label}`;
  });
  public readonly chartData = computed<JourneyChartData>(() => {
    const monthlyData = this.monthlyData();
    if (monthlyData.length === 0) {
      return {labels: [], datasets: []};
    }

    const labels = monthlyData.map(d => d.label);
    const addedData = monthlyData.map(d => d.cumulativeAdded);
    const finishedData = monthlyData.map(d => d.cumulativeFinished);

    return {
      labels,
      datasets: [
        {
          label: this.t.translate('statsLibrary.readingJourney.legendBooksAdded'),
          data: addedData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          pointBackgroundColor: '#3b82f6',
          fill: true,
          order: 2
        },
        {
          label: this.t.translate('statsLibrary.readingJourney.legendBooksFinished'),
          data: finishedData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          pointBackgroundColor: '#10b981',
          fill: true,
          order: 1
        }
      ]
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
            maxTicksLimit: 24
          },
          grid: {
          },
          border: {display: false},
          title: {
            display: true,
            text: this.t.translate('statsLibrary.readingJourney.axisMonth'),
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
            precision: 0
          },
          grid: {
          },
          border: {display: false},
          title: {
            display: true,
            text: this.t.translate('statsLibrary.readingJourney.axisCumulativeBooks'),
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
          display: true,
          position: 'top',
          labels: {
            font: {
              family: "'Inter', sans-serif",
              size: 12
            },
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          enabled: true,
          borderColor: '#10b981',
          borderWidth: 2,
          cornerRadius: 8,
          padding: 12,
          titleFont: {size: 13, weight: 'bold'},
          bodyFont: {size: 11},
          callbacks: {
            title: (context) => context[0].label,
            afterBody: (context) => {
              const dataIndex = context[0].dataIndex;
              const addedValue = context[0].chart.data.datasets[0].data[dataIndex] as number;
              const finishedValue = context[0].chart.data.datasets[1].data[dataIndex] as number;
              const backlog = addedValue - finishedValue;
              return [`\n${this.t.translate('statsLibrary.readingJourney.tooltipBacklog', {count: backlog})}`];
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
          radius: 3,
          hoverRadius: 6,
          borderWidth: 2
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    };
  }

  private formatMonthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
  }

}
