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
import { type ReadingClockStats } from '../../../../data/user/reading-clock-stats';

type ReadingClockChartData = ChartData<'polarArea', number[], string>;

@Component({
  selector: 'app-reading-clock-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './reading-clock-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadingClockChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<ReadingClockStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'polarArea' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
    return this.stats().segments.length > 0 ? 'ready' : 'empty';
  });

  readonly hourLabels = computed<readonly string[]>(() => {
    const locale = this.activeLanguage();
    return Array.from({ length: 24 }, (_, hour) => formatHour(hour, locale));
  });
  readonly peakHourLabel = computed(() => {
    const peakHour = this.stats().peakHourOfDay;
    return peakHour === null ? '—' : this.hourLabels()[peakHour];
  });
  readonly readerTypeLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate(`statsUser.readingClock.${this.stats().readerType}`);
  });

  readonly chartData = computed<ReadingClockChartData>(() => {
    const segments = this.stats().segments;
    const peakMinutes = Math.max(1, ...segments.map((segment) => segment.minutes));

    return {
      labels: [...this.hourLabels()],
      datasets: [
        {
          data: segments.map((segment) => segment.minutes),
          backgroundColor: segments.map((segment) => segmentColor(segment.minutes / peakMinutes)),
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartOptions<'polarArea'>>(() => {
    this.activeLanguage();
    const hourLabels = this.hourLabels();

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, bottom: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          borderWidth: 1,
          cornerRadius: 6,
          padding: 12,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            title: (context) => hourLabels[context[0].dataIndex],
            label: (context) => {
              const minutes = context.parsed.r;
              const time =
                minutes >= 60
                  ? `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`
                  : `${Math.round(minutes)}m`;
              return this.transloco.translate('statsUser.readingClock.tooltipReading', { time });
            },
          },
        },
      },
      scales: {
        r: {
          ticks: { display: false },
          pointLabels: { display: true, font: { size: 10 } },
        },
      },
    };
  });
}

function formatHour(hour: number, locale: string): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: 'numeric' });
}

function segmentColor(ratio: number): string {
  if (ratio >= 0.7) return 'rgba(255, 152, 0, 0.8)';
  if (ratio >= 0.4) return 'rgba(255, 193, 7, 0.7)';
  if (ratio >= 0.15) return 'rgba(100, 181, 246, 0.6)';
  return 'rgba(66, 133, 244, 0.35)';
}
