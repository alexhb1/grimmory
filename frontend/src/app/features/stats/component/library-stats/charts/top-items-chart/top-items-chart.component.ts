import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData, type TooltipItem } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { ReadStatus } from '../../../../../book/model/book.model';
import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import {
  TopItemsKind,
  TopItemsKindStats,
  TopItemsStats,
} from '../../../../data/library/top-items-stats';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

interface ItemStats {
  name: string;
  count: number;
  statusBreakdown: Record<ReadStatus, number>;
}

interface TopItemsLegendEntry {
  readonly status: ReadStatus;
  readonly label: string;
  readonly color: string;
}

type ItemChartData = ChartData<'bar', number[], string>;

const DATA_TYPE_DEFS: {key: string; value: TopItemsKind; icon: string; color: string}[] = [
  {key: 'authors', value: 'authors', icon: 'pi-th-large', color: '#2563EB'},
  {key: 'categories', value: 'categories', icon: 'pi-user', color: '#0D9488'},
  {key: 'series', value: 'series', icon: 'pi-tag', color: '#DB2777'},
  {key: 'publishers', value: 'publishers', icon: 'pi-building', color: '#7C3AED'},
  {key: 'tags', value: 'tags', icon: 'pi-bookmark', color: '#EAB308'},
  {key: 'moods', value: 'moods', icon: 'pi-heart', color: '#EA580C'},
];

const READ_STATUS_KEYS: Record<ReadStatus, string> = {
  [ReadStatus.READ]: 'read',
  [ReadStatus.READING]: 'reading',
  [ReadStatus.RE_READING]: 'reReading',
  [ReadStatus.UNREAD]: 'unread',
  [ReadStatus.PARTIALLY_READ]: 'partiallyRead',
  [ReadStatus.PAUSED]: 'paused',
  [ReadStatus.WONT_READ]: 'wontRead',
  [ReadStatus.ABANDONED]: 'abandoned',
  [ReadStatus.UNSET]: 'notSet',
};

const READ_STATUS_COLORS: Record<ReadStatus, string> = {
  [ReadStatus.READ]: '#22c55e',
  [ReadStatus.READING]: '#3b82f6',
  [ReadStatus.RE_READING]: '#8b5cf6',
  [ReadStatus.UNREAD]: '#6b7280',
  [ReadStatus.PARTIALLY_READ]: '#f59e0b',
  [ReadStatus.PAUSED]: '#eab308',
  [ReadStatus.WONT_READ]: '#ef4444',
  [ReadStatus.ABANDONED]: '#dc2626',
  [ReadStatus.UNSET]: '#9ca3af',
};

@Component({
  selector: 'app-top-items-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [AppSelectComponent, BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './top-items-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class TopItemsChartComponent implements OnInit {
  private readonly t = inject(TranslocoService);

  readonly stats = input.required<TopItemsStats>();
  readonly loading = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly initialDataType = input<TopItemsKind | null>(null);

  readonly chartType = 'bar' as const;
  readonly dataTypeOptions = DATA_TYPE_DEFS.map(def => ({
    label: this.t.translate(`statsLibrary.topItems.dataTypes.${def.key}`),
    value: def.value,
    icon: def.icon,
    color: def.color,
  }));
  readonly selectedDataType = signal(this.dataTypeOptions[0]);
  readonly kindStats = computed(() => this.stats().kinds[this.selectedDataType().value]);
  readonly itemStats = computed<ItemStats[]>(() => this.kindStats().items.map(item => ({
    name: item.name,
    count: item.bookCount,
    statusBreakdown: Object.fromEntries(
      Object.values(ReadStatus).map(status => [
        status,
        item.segments
          .filter(segment => segment.status === status)
          .reduce((total, segment) => total + segment.count, 0),
      ]),
    ) as Record<ReadStatus, number>,
  })));
  readonly totalItems = computed(() => this.itemStats().length);
  readonly insights = computed(() => this.buildInsights(this.kindStats()));
  readonly state = computed<StatsChartState>(() => {
    if (this.loading()) return 'loading';
    return this.totalItems() > 0 ? 'ready' : 'empty';
  });
  readonly legend = computed<readonly TopItemsLegendEntry[]>(() =>
    this.kindStats().statuses.map(status => ({
      status,
      label: this.t.translate(`statsLibrary.topItems.readStatus.${READ_STATUS_KEYS[status]}`),
      color: READ_STATUS_COLORS[status],
    })),
  );

  readonly chartData = computed<ItemChartData>(() => {
    const stats = this.itemStats();
    return {
      labels: stats.map(item => this.truncateTitle(item.name, 30)),
      datasets: this.kindStats().statuses.map(status => ({
        label: this.t.translate(`statsLibrary.topItems.readStatus.${READ_STATUS_KEYS[status]}`),
        data: stats.map(item => item.statusBreakdown[status]),
        backgroundColor: READ_STATUS_COLORS[status],
        borderColor: READ_STATUS_COLORS[status],
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.85,
        categoryPercentage: 0.8,
        hoverBorderWidth: 2,
      })),
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'bar'>['options']>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    layout: {padding: {top: 10, right: 20, bottom: 10, left: 10}},
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        ticks: {font: {family: "'Inter', sans-serif", size: 11}, precision: 0, stepSize: 1},
        border: {display: false},
        title: {
          display: true,
          text: this.t.translate('statsLibrary.topItems.axisNumberOfBooks'),
          font: {family: "'Inter', sans-serif", size: 12, weight: 500},
        },
      },
      y: {
        stacked: true,
        ticks: {font: {family: "'Inter', sans-serif", size: 11}, maxTicksLimit: 25},
        grid: {display: false},
        border: {display: false},
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        borderColor: this.selectedDataType().color,
        borderWidth: 2,
        cornerRadius: 8,
        displayColors: true,
        padding: 12,
        titleFont: {size: 14, weight: 'bold'},
        bodyFont: {size: 12},
        callbacks: {
          title: context => this.itemStats()[context[0].dataIndex]?.name || 'Unknown',
          label: context => this.formatTooltipLabel(context),
        },
      },
    },
    interaction: {intersect: true, mode: 'nearest', axis: 'y'},
  }));

  ngOnInit(): void {
    const initialOption = this.dataTypeOptions.find(option => option.value === this.initialDataType());
    if (initialOption) this.selectedDataType.set(initialOption);
  }

  onDataTypeChange(kind: TopItemsKind | null): void {
    const option = this.dataTypeOptions.find(candidate => candidate.value === kind);
    if (option) this.selectedDataType.set(option);
  }

  private buildInsights(stats: TopItemsKindStats): {icon: string; label: string; value: string}[] {
    const top = stats.items[0];
    if (!top) return [];

    const typeName = this.selectedDataType().label.toLowerCase().slice(0, -1);
    const insights = [{
      icon: 'pi-trophy',
      label: this.t.translate('statsLibrary.topItems.insightTop', {type: typeName}),
      value: this.t.translate('statsLibrary.topItems.insightTopValue', {
        name: top.name,
        count: top.bookCount,
      }),
    }];

    if (stats.mostCompleted && stats.mostCompleted.readPercent > 0) {
      insights.push({
        icon: 'pi-check-circle',
        label: this.t.translate('statsLibrary.topItems.insightMostCompleted'),
        value: this.t.translate('statsLibrary.topItems.insightMostCompletedValue', {
          name: stats.mostCompleted.name,
          percent: stats.mostCompleted.readPercent,
        }),
      });
    }
    if (stats.topFiveSharePercent !== null) {
      insights.push({
        icon: 'pi-chart-pie',
        label: this.t.translate('statsLibrary.topItems.insightTop5Coverage'),
        value: this.t.translate('statsLibrary.topItems.insightTop5CoverageValue', {
          percent: stats.topFiveSharePercent,
        }),
      });
    }
    insights.push({
      icon: 'pi-book',
      label: this.t.translate('statsLibrary.topItems.insightAvgPer', {type: typeName}),
      value: this.t.translate('statsLibrary.topItems.insightAvgPerValue', {
        avg: stats.averageBooksPerItem.toFixed(1),
      }),
    });

    return insights;
  }

  private formatTooltipLabel(context: TooltipItem<'bar'>): string {
    const value = context.parsed.x;
    if (value === 0) return '';

    const statusLabel = context.dataset.label || this.t.translate('statsLibrary.pageCount.axisBooks');
    return value === 1
      ? this.t.translate('statsLibrary.topItems.tooltipBook', {status: statusLabel, value})
      : this.t.translate('statsLibrary.topItems.tooltipBooks', {status: statusLabel, value});
  }

  private truncateTitle(title: string, maxLength: number): string {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  }
}
