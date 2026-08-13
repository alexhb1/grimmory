import {Component, computed, inject} from '@angular/core';
import {BaseChartDirective} from 'ng2-charts';
import {ChartConfiguration, ChartData, Chart} from 'chart.js';
import {Tooltip} from '@openng/optimus-ui/tooltip';
import {BookService} from '../../../../../book/service/book.service';
import {Book, ReadStatus} from '../../../../../book/model/book.model';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';

interface ReadingStatusStats {
  status: string;
  rawStatus: ReadStatus;
  count: number;
  percentage: number;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  [ReadStatus.UNREAD]: '#6c757d',
  [ReadStatus.READING]: '#17a2b8',
  [ReadStatus.RE_READING]: '#6f42c1',
  [ReadStatus.READ]: '#28a745',
  [ReadStatus.PARTIALLY_READ]: '#ffc107',
  [ReadStatus.PAUSED]: '#fd7e14',
  [ReadStatus.WONT_READ]: '#dc3545',
  [ReadStatus.ABANDONED]: '#e74c3c',
  [ReadStatus.UNSET]: '#343a40'
} as const;

const READ_STATUSES = new Set<string>(Object.values(ReadStatus));

function isReadStatus(value: unknown): value is ReadStatus {
  return typeof value === 'string' && READ_STATUSES.has(value);
}

type StatusChartData = ChartData<'doughnut', number[], string>;

@Component({
  selector: 'app-read-status-chart',
  standalone: true,
  imports: [BaseChartDirective, Tooltip, TranslocoDirective],
  templateUrl: './read-status-chart.component.html',
  styleUrls: ['./read-status-chart.component.scss']
})
export class ReadStatusChartComponent {
  private readonly bookService = inject(BookService);
  private readonly t = inject(TranslocoService);
  private readonly readingStatusStats = computed(() => {
    if (this.bookService.isBooksLoading()) {
      return [];
    }

    return this.calculateReadingStatusStats(this.bookService.books());
  });

  public readonly chartType = 'doughnut' as const;

  public readonly chartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {top: 15}
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          padding: 15,
          usePointStyle: true,
          font: {
            family: "'Inter', sans-serif",
            size: 12
          },
          generateLabels: this.generateLegendLabels.bind(this)
        }
      },
      tooltip: {
        enabled: true,
        borderWidth: 1,
        cornerRadius: 6,
        displayColors: true,
        padding: 12,
        titleFont: {size: 14, weight: 'bold'},
        bodyFont: {size: 13},
        callbacks: {
          title: (context) => context[0]?.label || '',
          label: (context) => {
            const dataIndex = context.dataIndex;
            const dataset = context.dataset;
            const value = dataset.data[dataIndex];
            const label = context.chart.data.labels?.[dataIndex] || '';
            const total = dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return this.t.translate('statsUser.readStatus.tooltipLabel', {label, value, percentage});
          }
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'point'
    }
  };

  public readonly chartData = computed<StatusChartData>(() => {
    try {
      const stats = this.readingStatusStats();
      const labels = stats.map(s => s.status);
      const dataValues = stats.map(s => s.count);
      const colors = stats.map(s => STATUS_COLOR_MAP[s.rawStatus] || '#6c757d');

      return {
        labels,
        datasets: [{
          data: dataValues,
          backgroundColor: colors.length > 0 ? colors : Object.values(STATUS_COLOR_MAP)
        }]
      };
    } catch (error) {
      console.error('Error updating chart data:', error);
      return {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: Object.values(STATUS_COLOR_MAP)
        }]
      };
    }
  });

  private calculateReadingStatusStats(books: Book[]): ReadingStatusStats[] {
    if (books.length === 0) {
      return [];
    }

    return this.processReadingStatusStats(books);
  }

  private processReadingStatusStats(books: Book[]): ReadingStatusStats[] {
    if (books.length === 0) {
      return [];
    }

    const statusMap = this.buildStatusMap(books);
    return this.convertMapToStats(statusMap, books.length);
  }

  private buildStatusMap(books: Book[]): Map<ReadStatus, number> {
    const statusMap = new Map<ReadStatus, number>();

    for (const book of books) {
      const rawStatus = book.readStatus;
      const status = isReadStatus(rawStatus) ? rawStatus : ReadStatus.UNSET;

      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    }

    return statusMap;
  }

  private convertMapToStats(statusMap: Map<ReadStatus, number>, totalBooks: number): ReadingStatusStats[] {
    return Array.from(statusMap.entries())
      .map(([status, count]) => ({
        status: this.formatReadStatus(status),
        rawStatus: status,
        count,
        percentage: Number(((count / totalBooks) * 100).toFixed(1))
      }))
      .sort((a, b) => b.count - a.count);
  }

  private formatReadStatus(status: ReadStatus | null | undefined): string {
    const STATUS_MAPPING: Record<string, string> = {
      [ReadStatus.UNREAD]: this.t.translate('statsUser.readStatus.unread'),
      [ReadStatus.READING]: this.t.translate('statsUser.readStatus.currentlyReading'),
      [ReadStatus.RE_READING]: this.t.translate('statsUser.readStatus.reReading'),
      [ReadStatus.READ]: this.t.translate('statsUser.readStatus.read'),
      [ReadStatus.PARTIALLY_READ]: this.t.translate('statsUser.readStatus.partiallyRead'),
      [ReadStatus.PAUSED]: this.t.translate('statsUser.readStatus.paused'),
      [ReadStatus.WONT_READ]: this.t.translate('statsUser.readStatus.wontRead'),
      [ReadStatus.ABANDONED]: this.t.translate('statsUser.readStatus.abandoned'),
      [ReadStatus.UNSET]: this.t.translate('statsUser.readStatus.noStatus')
    };

    if (!status) return this.t.translate('statsUser.readStatus.noStatus');
    return STATUS_MAPPING[status] ?? this.t.translate('statsUser.readStatus.noStatus');
  }

  private generateLegendLabels(chart: Chart<'doughnut'>) {
    const data = chart.data;
    if (!data.labels?.length || !data.datasets?.[0]?.data?.length) {
      return [];
    }

    const dataset = data.datasets[0];
    const dataValues = dataset.data;
    const stats = this.readingStatusStats();

    return data.labels.map((label: unknown, index: number) => {
      const status = stats[index]?.rawStatus ?? ReadStatus.UNSET;

      return {
        text: `${String(label)} (${dataValues[index]})`,
        fillStyle: STATUS_COLOR_MAP[status],
        lineWidth: 1,
        hidden: !chart.getDataVisibility(index),
        index,
      };
    });
  }
}
