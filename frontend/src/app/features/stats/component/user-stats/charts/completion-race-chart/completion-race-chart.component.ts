import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { type ChartData, type ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { AppButtonComponent } from '../../../../../../shared/ui/button/app-button.component';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { type CompletionRaceStats } from '../../../../data/user/completion-race-stats';

type CompletionRaceChartData = ChartData<'line', { x: number; y: number }[], number>;

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
const CHART_FONT_FAMILY = "'Inter', sans-serif";

@Component({
  selector: 'app-completion-race-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [
    AppButtonComponent,
    BaseChartDirective,
    LucideChevronLeft,
    LucideChevronRight,
    StatsChartCardComponent,
    TranslocoDirective,
  ],
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
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly yearChange = output<number>();

  readonly chartType = 'line' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });

  readonly previousYearLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.completionRace.previousYear');
  });
  readonly nextYearLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.completionRace.nextYear');
  });
  readonly chartData = computed<CompletionRaceChartData>(() => {
    return {
      datasets: this.stats().books.map((book, index) => ({
        label: truncate(book.bookTitle, LABEL_LIMIT),
        data: book.points.map((point) => ({ x: point.dayNumber, y: point.progress })),
        borderColor: LINE_COLORS[index % LINE_COLORS.length],
        backgroundColor: LINE_COLORS[index % LINE_COLORS.length],
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
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { family: CHART_FONT_FAMILY, size: 11 },
            boxWidth: 12,
            padding: 8,
            usePointStyle: true,
            pointStyle: 'line',
          },
        },
        tooltip: {
          enabled: true,
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
            font: { family: CHART_FONT_FAMILY, size: 12, weight: 'bold' },
          },
          ticks: { font: { family: CHART_FONT_FAMILY, size: 11 }, stepSize: 1 },
          border: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.completionRace.axisProgress'),
            font: { family: CHART_FONT_FAMILY, size: 12, weight: 'bold' },
          },
          ticks: {
            font: { family: CHART_FONT_FAMILY, size: 11 },
            callback: (value) => `${value}%`,
          },
          border: { display: false },
        },
      },
      interaction: { mode: 'nearest', intersect: false },
    };
  });

  protected changeYear(delta: number): void {
    this.yearChange.emit(this.year() + delta);
  }

  protected formatDays(value: number): string {
    return `${value}d`;
  }
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength)}...` : value;
}
