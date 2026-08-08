import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { AppButtonComponent } from '../../../../../../shared/ui/button/app-button.component';
import { AppInputComponent } from '../../../../../../shared/ui/input/app-input.component';
import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import {
  type SeriesProgressStats,
  type SeriesProgressStatus,
} from '../../../../data/user/series-progress-stats';

type SeriesProgressFilter = 'all' | SeriesProgressStatus;
type SeriesProgressSeries = SeriesProgressStats['series'][number];

type SeriesProgressSort = 'progress' | 'rating' | 'books' | 'name';

interface SeriesProgressSegment {
  readonly key: string;
  readonly labelKey: string;
  readonly fill: string;
  readonly border: string;
  readonly count: (series: SeriesProgressSeries) => number;
}

interface SeriesProgressLegendEntry {
  readonly key: string;
  readonly label: string;
  readonly color: string;
}

const SEGMENTS: readonly SeriesProgressSegment[] = [
  {
    key: 'read',
    labelKey: 'read',
    fill: 'rgba(76, 175, 80, 0.85)',
    border: '#4caf50',
    count: (series) => series.booksRead,
  },
  {
    key: 'reading',
    labelKey: 'reading',
    fill: 'rgba(255, 193, 7, 0.85)',
    border: '#ffc107',
    count: (series) => series.booksReading,
  },
  {
    key: 'partiallyRead',
    labelKey: 'partiallyRead',
    fill: 'rgba(255, 152, 0, 0.85)',
    border: '#ff9800',
    count: (series) => series.booksPartiallyRead,
  },
  {
    key: 'paused',
    labelKey: 'paused',
    fill: 'rgba(33, 150, 243, 0.85)',
    border: '#2196f3',
    count: (series) => series.booksPaused,
  },
  {
    key: 'abandoned',
    labelKey: 'abandoned',
    fill: 'rgba(239, 83, 80, 0.85)',
    border: '#ef5350',
    count: (series) => series.booksAbandoned,
  },
  {
    key: 'wontRead',
    labelKey: 'wontRead',
    fill: 'rgba(158, 158, 158, 0.6)',
    border: '#9e9e9e',
    count: (series) => series.booksWontRead,
  },
  {
    key: 'unread',
    labelKey: 'unread',
    fill: 'rgba(158, 158, 158, 0.3)',
    border: '#9e9e9e',
    count: (series) => series.booksUnread,
  },
];

const STATUS_COLORS: Readonly<Record<SeriesProgressStatus, string>> = {
  completed: '#4caf50',
  'in-progress': '#ffc107',
  'not-started': '#9e9e9e',
  paused: '#2196f3',
  abandoned: '#ef5350',
};

const FILTER_OPTIONS: readonly { value: SeriesProgressFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'allStatus' },
  { value: 'in-progress', labelKey: 'inProgress' },
  { value: 'completed', labelKey: 'completed' },
  { value: 'not-started', labelKey: 'notStarted' },
];

const SORT_OPTIONS: readonly { value: SeriesProgressSort; labelKey: string }[] = [
  { value: 'progress', labelKey: 'sortByProgress' },
  { value: 'rating', labelKey: 'sortByRating' },
  { value: 'books', labelKey: 'sortByBooks' },
  { value: 'name', labelKey: 'sortByName' },
];

const PAGE_SIZE = 10;
const CHART_DISPLAY_COUNT = 8;
const LABEL_LIMIT = 25;

@Component({
  selector: 'app-series-progress-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [
    AppButtonComponent,
    AppInputComponent,
    AppSelectComponent,
    BaseChartDirective,
    LucideChevronLeft,
    LucideChevronRight,
    StatsChartCardComponent,
    TranslocoDirective,
  ],
  templateUrl: './series-progress-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class SeriesProgressChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<SeriesProgressStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'bar' as const;
  readonly searchTerm = signal('');
  readonly filterStatus = signal<SeriesProgressFilter>('all');
  readonly sortBy = signal<SeriesProgressSort>('progress');
  readonly page = signal(0);

  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
    return this.stats().series.length > 0 ? 'ready' : 'empty';
  });

  readonly filterOptions = computed<readonly SelectOption<SeriesProgressFilter>[]>(() => {
    this.activeLanguage();
    return FILTER_OPTIONS.map(({ value, labelKey }) => ({
      value,
      label: this.transloco.translate(`statsUser.seriesProgress.${labelKey}`),
    }));
  });

  readonly sortOptions = computed<readonly SelectOption<SeriesProgressSort>[]>(() => {
    this.activeLanguage();
    return SORT_OPTIONS.map(({ value, labelKey }) => ({
      value,
      label: this.transloco.translate(`statsUser.seriesProgress.${labelKey}`),
    }));
  });

  readonly filteredSeries = computed<readonly SeriesProgressSeries[]>(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const status = this.filterStatus();
    const sortBy = this.sortBy();

    return this.stats()
      .series.filter(
        (series) =>
          (!term || series.name.toLowerCase().includes(term))
          && (status === 'all' || series.status === status),
      )
      .sort((left, right) => {
        switch (sortBy) {
          case 'progress':
            return right.completionPercent - left.completionPercent;
          case 'rating':
            return (right.averagePersonalRating ?? 0) - (left.averagePersonalRating ?? 0);
          case 'books':
            return right.booksOwned - left.booksOwned;
          case 'name':
            return left.name.localeCompare(right.name);
        }
      });
  });

  readonly totalPages = computed(() => Math.ceil(this.filteredSeries().length / PAGE_SIZE));
  readonly hasPreviousPage = computed(() => this.page() > 0);
  readonly hasNextPage = computed(
    () => (this.page() + 1) * PAGE_SIZE < this.filteredSeries().length,
  );
  readonly displayedSeries = computed<readonly SeriesProgressSeries[]>(() => {
    const start = this.page() * PAGE_SIZE;
    return this.filteredSeries().slice(start, start + PAGE_SIZE);
  });

  readonly chartSeries = computed<readonly SeriesProgressSeries[]>(() =>
    this.stats().series.slice(0, CHART_DISPLAY_COUNT),
  );

  readonly previousPageLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('common.back');
  });
  readonly nextPageLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('common.next');
  });

  readonly legend = computed<readonly SeriesProgressLegendEntry[]>(() => {
    this.activeLanguage();
    return SEGMENTS.map((segment) => ({
      key: segment.key,
      label: this.transloco.translate(`statsUser.seriesProgress.${segment.labelKey}`),
      color: segment.fill,
    }));
  });

  readonly chartData = computed<ChartData<'bar', number[], string>>(() => {
    this.activeLanguage();
    const series = this.chartSeries();

    return {
      labels: series.map((entry) => truncate(entry.name, LABEL_LIMIT)),
      datasets: SEGMENTS.map((segment) => ({
        label: this.transloco.translate(`statsUser.seriesProgress.${segment.labelKey}`),
        data: series.map((entry) =>
          entry.booksOwned > 0 ? Math.round((segment.count(entry) / entry.booksOwned) * 100) : 0,
        ),
        backgroundColor: segment.fill,
        borderColor: segment.border,
        borderWidth: 1,
        borderRadius: 2,
      })),
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const series = this.chartSeries();

    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      layout: { padding: { top: 10, right: 20, bottom: 10, left: 10 } },
      scales: {
        x: {
          stacked: true,
          max: 100,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.seriesProgress.axisCompletion'),
            font: { family: "'Inter', sans-serif", size: 11, weight: 500 },
          },
          ticks: {
            font: { family: "'Inter', sans-serif", size: 10 },
            callback: (value) => `${value}%`,
          },
        },
        y: {
          stacked: true,
          ticks: { font: { family: "'Inter', sans-serif", size: 10 } },
          grid: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderColor: '#673ab7',
          borderWidth: 2,
          cornerRadius: 8,
          padding: 12,
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 10 },
          callbacks: {
            title: (context) => series[context[0]?.dataIndex ?? -1]?.name ?? '',
            afterBody: (context) => {
              const item = context.at(0);
              if (!item) return [];

              const entry = series.at(item.dataIndex);
              if (!entry) return [];

              const lines = [
                this.transloco.translate('statsUser.seriesProgress.tooltipRead', {
                  read: entry.booksRead,
                  owned: entry.booksOwned,
                }),
              ];
              if (entry.totalInSeries) {
                lines.push(
                  this.transloco.translate('statsUser.seriesProgress.tooltipSeriesTotal', {
                    total: entry.totalInSeries,
                  }),
                );
              }
              if (entry.averagePersonalRating) {
                lines.push(
                  this.transloco.translate('statsUser.seriesProgress.tooltipYourRating', {
                    rating: this.formatRating(entry.averagePersonalRating),
                  }),
                );
              }

              return lines;
            },
          },
        },
      },
    };
  });

  protected onSearchChange(term: string): void {
    this.searchTerm.set(term);
    this.page.set(0);
  }

  protected onFilterChange(status: SeriesProgressFilter | null): void {
    this.filterStatus.set(status ?? 'all');
    this.page.set(0);
  }

  protected onSortChange(sortBy: SeriesProgressSort | null): void {
    this.sortBy.set(sortBy ?? 'progress');
    this.page.set(0);
  }

  protected previousPage(): void {
    if (this.hasPreviousPage()) this.page.update((page) => page - 1);
  }

  protected nextPage(): void {
    if (this.hasNextPage()) this.page.update((page) => page + 1);
  }

  protected readonly progressColors = { read: '#4caf50', reading: '#ffc107' };

  protected statusColor(status: SeriesProgressStatus): string {
    return STATUS_COLORS[status];
  }

  protected readingPercent(series: SeriesProgressSeries): number {
    return series.booksOwned > 0 ? (series.booksReading / series.booksOwned) * 100 : 0;
  }

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

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 3)}...` : value;
}
