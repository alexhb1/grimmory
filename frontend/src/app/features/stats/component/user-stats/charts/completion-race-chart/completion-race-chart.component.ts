import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartData, type ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { type CompletionRaceStats } from '../../../../data/user/completion-race-stats';

type CompletionRaceChartData = ChartData<'line', { x: number; y: number }[], number>;

interface CompletionRaceLegendEntry {
  readonly bookId: number;
  readonly label: string;
  readonly color: string;
}

const LINE_COLORS: readonly string[] = [
  '#4caf50',
  '#2196f3',
  '#ff9800',
  '#e91e63',
  '#9c27b0',
  '#00bcd4',
  '#ff5722',
  '#8bc34a',
  '#3f51b5',
  '#ffc107',
  '#795548',
  '#607d8b',
  '#f44336',
  '#009688',
  '#cddc39',
];

const LABEL_LIMIT = 30;

@Component({
  selector: 'app-completion-race-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [AppSelectComponent, BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './completion-race-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class CompletionRaceChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<CompletionRaceStats>();
  readonly year = input.required<number>();
  readonly yearOptions = input<readonly number[]>([]);
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly yearChange = output<number>();

  readonly chartType = 'line' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });

  readonly yearSelectOptions = computed<readonly SelectOption<number>[]>(() => {
    return this.yearOptions().map((year) => ({ value: year, label: String(year) }));
  });
  readonly yearSelectorLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.peakHours.selectYear');
  });
  readonly legend = computed<readonly CompletionRaceLegendEntry[]>(() =>
    this.stats().books.map((book, index) => ({
      bookId: book.bookId,
      label: truncate(book.bookTitle, LABEL_LIMIT),
      color: LINE_COLORS[index % LINE_COLORS.length],
    })),
  );

  readonly chartData = computed<CompletionRaceChartData>(() => {
    const legend = this.legend();

    return {
      datasets: this.stats().books.map((book, index) => ({
        label: legend[index].label,
        data: book.points.map((point) => ({ x: point.dayNumber, y: point.progress })),
        borderColor: legend[index].color,
        backgroundColor: legend[index].color,
        fill: false,
        tension: 0.3,
        stepped: 'before' as const,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      })),
    };
  });

  readonly chartOptions = computed<ChartOptions<'line'>>(() => {
    this.activeLanguage();

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, bottom: 10, left: 10, right: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          borderWidth: 1,
          cornerRadius: 6,
          padding: 12,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 11 },
          callbacks: {
            title: (context) => context[0].dataset.label ?? '',
            label: (context) =>
              this.transloco.translate('statsUser.completionRace.tooltipDayProgress', {
                day: context.parsed.x,
                progress: (context.parsed.y ?? 0).toFixed(1),
              }),
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: this.transloco.translate('statsUser.completionRace.axisDaysSinceFirstSession'),
            font: { size: 12, weight: 'bold' },
          },
          ticks: { font: { size: 11 }, stepSize: 1 },
          border: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.completionRace.axisProgress'),
            font: { size: 12, weight: 'bold' },
          },
          ticks: { font: { size: 11 }, callback: (value) => `${value}%` },
          border: { display: false },
        },
      },
      interaction: { mode: 'nearest', intersect: false },
    };
  });

  protected onYearChange(year: number | null): void {
    if (year !== null) this.yearChange.emit(year);
  }

}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength)}…` : value;
}
