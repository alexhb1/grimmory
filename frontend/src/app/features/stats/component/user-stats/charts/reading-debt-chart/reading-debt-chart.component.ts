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
import { type ReadingDebtStats } from '../../../../data/user/reading-debt-stats';

interface ReadingDebtLegendEntry {
  readonly key: string;
  readonly label: string;
  readonly color: string;
}

const SERIES_COLORS = {
  added: '#ef5350',
  finished: '#66bb6a',
  backlog: '#ffc107',
} as const;

@Component({
  selector: 'app-reading-debt-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './reading-debt-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadingDebtChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<ReadingDebtStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'bar' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
    return this.stats().months.length > 0 ? 'ready' : 'empty';
  });

  readonly trendLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate(`statsUser.readingDebt.${this.stats().trend}`);
  });

  readonly legend = computed<readonly ReadingDebtLegendEntry[]>(() => {
    this.activeLanguage();
    return [
      {
        key: 'added',
        label: this.transloco.translate('statsUser.readingDebt.booksAdded'),
        color: SERIES_COLORS.added,
      },
      {
        key: 'finished',
        label: this.transloco.translate('statsUser.readingDebt.booksFinished'),
        color: SERIES_COLORS.finished,
      },
      {
        key: 'backlog',
        label: this.transloco.translate('statsUser.readingDebt.backlog'),
        color: SERIES_COLORS.backlog,
      },
    ];
  });

  readonly chartData = computed<ChartData<'bar' | 'line', number[], string>>(() => {
    this.activeLanguage();
    const months = this.stats().months;
    const backlogDataset = {
      label: this.transloco.translate('statsUser.readingDebt.backlog'),
      data: months.map((month) => month.backlog),
      type: 'line',
      borderColor: '#ffc107',
      backgroundColor: 'rgba(255, 193, 7, 0.1)',
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: '#ffc107',
      fill: false,
      tension: 0.3,
      yAxisID: 'y1',
      order: 1,
    } as const;

    return {
      labels: months.map((month) => this.formatMonth(month.year, month.monthIndex)),
      datasets: [
        {
          label: this.transloco.translate('statsUser.readingDebt.booksAdded'),
          data: months.map((month) => month.addedCount),
          backgroundColor: 'rgba(239, 83, 80, 0.7)',
          borderColor: '#ef5350',
          borderWidth: 1,
          borderRadius: 4,
          order: 2,
        },
        {
          label: this.transloco.translate('statsUser.readingDebt.booksFinished'),
          data: months.map((month) => month.finishedCount),
          backgroundColor: 'rgba(102, 187, 106, 0.7)',
          borderColor: '#66bb6a',
          borderWidth: 1,
          borderRadius: 4,
          order: 2,
        },
        backlogDataset,
      ],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'bar' | 'line'>['options']>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    layout: { padding: { top: 10 } },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true, borderWidth: 1, cornerRadius: 6, padding: 10 },
    },
    scales: {
      x: { ticks: { font: { size: 10 } } },
      y: { ticks: { font: { size: 11 } } },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: 'rgba(255, 193, 7, 0.8)', font: { size: 11 } },
      },
    },
  }));

  protected formatCount(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }

  private formatMonth(year: number, monthIndex: number): string {
    return new Date(year, monthIndex, 1).toLocaleDateString(this.activeLanguage(), {
      month: 'short',
      year: '2-digit',
    });
  }
}
