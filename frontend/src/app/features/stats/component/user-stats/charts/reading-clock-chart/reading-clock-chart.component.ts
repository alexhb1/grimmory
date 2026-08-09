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

const HOUR_LABELS = [
  '12am', '1am', '2am', '3am', '4am', '5am',
  '6am', '7am', '8am', '9am', '10am', '11am',
  '12pm', '1pm', '2pm', '3pm', '4pm', '5pm',
  '6pm', '7pm', '8pm', '9pm', '10pm', '11pm',
] as const;

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
    if (this.loading()) return 'loading';
    return this.stats().segments.length > 0 ? 'ready' : 'empty';
  });

  readonly peakHourLabel = computed(() => {
    const peakHour = this.stats().peakHourOfDay;
    return peakHour === null ? '—' : HOUR_LABELS[peakHour];
  });
  readonly readerTypeLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate(`statsUser.readingClock.${this.stats().readerType}`);
  });

  readonly chartData = computed<ReadingClockChartData>(() => {
    const segments = this.stats().segments;
    const peakMinutes = Math.max(1, ...segments.map((segment) => segment.minutes));

    return {
      labels: [...HOUR_LABELS],
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
            title: (context) => HOUR_LABELS[context[0].dataIndex],
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
          pointLabels: {
            display: true,
            font: { family: "'Inter', sans-serif", size: 10 },
          },
        },
      },
    };
  });
}

function segmentColor(ratio: number): string {
  if (ratio >= 0.7) return 'rgba(255, 152, 0, 0.8)';
  if (ratio >= 0.4) return 'rgba(255, 193, 7, 0.7)';
  if (ratio >= 0.15) return 'rgba(100, 181, 246, 0.6)';
  return 'rgba(66, 133, 244, 0.35)';
}
