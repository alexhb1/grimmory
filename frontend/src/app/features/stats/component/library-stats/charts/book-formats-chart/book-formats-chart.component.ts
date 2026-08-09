import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import {
  type BookFormatStats,
  UNKNOWN_BOOK_FORMAT_ID,
} from '../../../../data/library/book-format-stats';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

interface BookFormatLegendEntry {
  readonly format: string;
  readonly label: string;
  readonly bookCount: number;
  readonly color: string;
}

type FormatChartData = ChartData<'pie', number[], string>;

const FORMAT_COLORS: Record<string, string> = {
  'PDF': '#E11D48',    // Rose
  'EPUB': '#0D9488',   // Teal
  'CBX': '#7C3AED',    // Violet
  'FB2': '#F59E0B',    // Amber
  'MOBI': '#2563EB',   // Blue
  'AZW3': '#16A34A'    // Green
};

@Component({
  selector: 'app-book-formats-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [
    BaseChartDirective,
    StatsChartCardComponent,
    TranslocoDirective,
  ],
  templateUrl: './book-formats-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class BookFormatsChartComponent {
  private readonly t = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.t.langChanges$, {
    initialValue: this.t.getActiveLang(),
  });

  readonly stats = input.required<BookFormatStats>();
  readonly loading = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'pie' as const;
  readonly totalBooks = computed(() => this.stats().totalBooks);
  readonly state = computed<StatsChartState>(() => {
    if (this.loading()) return 'loading';
    return this.totalBooks() > 0 ? 'ready' : 'empty';
  });
  readonly rows = computed<readonly BookFormatLegendEntry[]>(() => {
    this.activeLanguage();
    return this.stats().formats.map(({ format, bookCount }) => ({
      format,
      label: format === UNKNOWN_BOOK_FORMAT_ID
        ? this.t.translate('statsLibrary.bookFormats.unknown')
        : format,
      bookCount,
      color: FORMAT_COLORS[format] || '#6B7280',
    }));
  });

  readonly chartOptions: ChartConfiguration<'pie'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {top: 10, bottom: 10}
    },
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          font: {family: "'Inter', sans-serif", size: 12},
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 15,
        },
      },
      tooltip: {
        enabled: true,
        borderColor: '#E11D48',
        borderWidth: 2,
        cornerRadius: 8,
        padding: 12,
        titleFont: {size: 14, weight: 'bold'},
        bodyFont: {size: 12},
        callbacks: {
          label: (context) => {
            const value = context.parsed;
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return this.t.translate('statsLibrary.bookFormats.tooltipLabel', {label: context.label, value, percentage});
          }
        }
      }
    }
  };

  readonly chartData = computed<FormatChartData>(() => {
    const rows = this.rows();
    if (rows.length === 0) {
      return {labels: [], datasets: []};
    }

    const labels = rows.map(row => row.label);
    const data = rows.map(row => row.bookCount);
    const colors = rows.map(row => row.color);

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: colors
      }]
    };
  });

}
