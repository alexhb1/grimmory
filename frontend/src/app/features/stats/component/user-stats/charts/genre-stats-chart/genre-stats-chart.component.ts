import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { type GenreStats } from '../../../../data/user/genre-stats';
import {
  StatsCategoricalBarComponent,
  type StatsCategoricalBarPlot,
} from '../../../shared/stats-categorical-bar.component';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';

const LABEL_LIMIT = 12;

@Component({
  selector: 'app-genre-stats-chart',
  standalone: true,
  imports: [StatsCategoricalBarComponent, StatsChartCardComponent, TranslocoDirective],
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

  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().rows.length > 0 ? 'ready' : 'empty';
  });
  readonly plot = computed<StatsCategoricalBarPlot>(() => {
    this.activeLanguage();
    const rows = this.stats().rows;
    return {
      categories: rows.map((row) => ({
        label: row.genre,
        axisLabel: row.genre.length > LABEL_LIMIT ? `${row.genre.slice(0, LABEL_LIMIT)}…` : row.genre,
      })),
      series: [{
        label: this.transloco.translate('statsUser.genreStats.readingTime'),
        color: 'rgba(34, 197, 94, 0.8)',
        borderColor: 'rgba(34, 197, 94, 1)',
        values: rows.map((row) => ({
          value: row.totalDurationSeconds,
          tooltipLines: [`${row.genre}: ${this.formatShortDuration(row.totalDurationSeconds)}`],
        })),
      }],
      categoryAxisTitle: this.transloco.translate('statsUser.genreStats.axisGenres'),
      primaryAxis: {
        title: this.transloco.translate('statsUser.genreStats.axisTimeRead'),
        maxTicks: 8,
        formatTick: (value) => this.formatAxisDuration(value),
      },
      padding: { top: 10 },
      verticalCategoryLabels: true,
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
