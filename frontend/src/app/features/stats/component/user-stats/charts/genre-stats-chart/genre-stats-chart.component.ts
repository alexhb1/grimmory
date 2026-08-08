import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartData, type ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { type GenreStats } from '../../../../data/user/genre-stats';

type GenreChartData = ChartData<'bar', number[], string>;

const LABEL_LIMIT = 12;

@Component({
  selector: 'app-genre-stats-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './genre-stats-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class GenreStatsChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<GenreStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'bar' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().rows.length > 0 ? 'ready' : 'empty';
  });

  readonly chartData = computed<GenreChartData>(() => {
    this.activeLanguage();
    const rows = this.stats().rows;

    return {
      labels: rows.map((row) => row.genre),
      datasets: [
        {
          label: this.transloco.translate('statsUser.genreStats.readingTime'),
          data: rows.map((row) => row.totalDurationSeconds),
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderColor: 'rgba(34, 197, 94, 1)',
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.8,
          categoryPercentage: 0.6,
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartOptions<'bar'>>(() => {
    this.activeLanguage();
    const rows = this.stats().rows;

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          borderWidth: 1,
          cornerRadius: 6,
          padding: 12,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          callbacks: {
            label: (context) => {
              const row = rows.at(context.dataIndex);
              if (!row) return '';
              return `${row.genre}: ${this.formatShortDuration(row.totalDurationSeconds)}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.genreStats.axisGenres'),
            font: { size: 12 },
          },
          ticks: {
            font: { size: 11 },
            maxRotation: 90,
            minRotation: 90,
            callback: (_value, index) => {
              const genre = rows[index]?.genre ?? '';
              return genre.length > LABEL_LIMIT ? `${genre.slice(0, LABEL_LIMIT)}…` : genre;
            },
          },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          title: {
            display: true,
            text: this.transloco.translate('statsUser.genreStats.axisTimeRead'),
            font: { size: 12 },
          },
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            maxTicksLimit: 8,
            callback: (value) => this.formatAxisDuration(Number(value)),
          },
          border: { display: false },
        },
      },
    };
  });

  private formatShortDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  }

  private formatAxisDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      const dayLabel = this.label(days === 1 ? 'day' : 'days');
      return remainingHours > 0
        ? `${days} ${dayLabel} ${remainingHours} ${this.label(remainingHours === 1 ? 'hr' : 'hrs')}`
        : `${days} ${dayLabel}`;
    }

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      const hourLabel = this.label(hours === 1 ? 'hr' : 'hrs');
      return remainingMinutes > 0
        ? `${hours} ${hourLabel} ${remainingMinutes} ${this.label('min')}`
        : `${hours} ${hourLabel}`;
    }

    if (minutes > 0) return `${minutes} ${this.label('min')}`;
    return `${seconds} ${this.label('sec')}`;
  }

  private label(key: string): string {
    return this.transloco.translate(`statsUser.genreStats.${key}`);
  }
}
