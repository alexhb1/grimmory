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
import { type SessionArchetypeStats } from '../../../../data/user/session-archetypes-stats';

type SessionArchetypeChartData = ChartData<'scatter', { x: number; y: number }[], string>;

const DAY_COLORS: readonly string[] = [
  '#ef5350',
  '#ff9800',
  '#ffc107',
  '#66bb6a',
  '#42a5f5',
  '#7e57c2',
  '#ec407a',
];
const DAY_NAMES: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Component({
  selector: 'app-session-archetypes-chart',
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
  templateUrl: './session-archetypes-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class SessionArchetypesChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<SessionArchetypeStats>();
  readonly year = input.required<number>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly yearChange = output<number>();

  readonly chartType = 'scatter' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().sessionCount > 0 ? 'ready' : 'empty';
  });

  readonly previousYearLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.completionRace.previousYear');
  });
  readonly nextYearLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.completionRace.nextYear');
  });
  readonly dominantArchetypeLabel = computed(() => {
    this.activeLanguage();
    const archetype = this.stats().dominantArchetype;
    return archetype === null
      ? '—'
      : this.transloco.translate(`statsUser.sessionArchetypes.archetype_${archetype}`);
  });
  readonly chartData = computed<SessionArchetypeChartData>(() => {
    return {
      datasets: this.stats().days.map((day) => ({
        label: DAY_NAMES[(day.dayOfWeek - 1) % DAY_NAMES.length],
        data: day.points.map((point) => ({ x: point.hourOfDay, y: point.durationMinutes })),
        backgroundColor: `${DAY_COLORS[(day.dayOfWeek - 1) % DAY_COLORS.length]}AA`,
        borderColor: DAY_COLORS[(day.dayOfWeek - 1) % DAY_COLORS.length],
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 8,
      })),
    };
  });

  readonly chartOptions = computed<ChartOptions<'scatter'>>(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      layout: { padding: { top: 10, right: 20 } },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            font: { family: "'Inter', sans-serif", size: 11 },
            boxWidth: 10,
            padding: 12,
          },
        },
        tooltip: {
          cornerRadius: 6,
          padding: 10,
          callbacks: {
            label: (context) => {
              const hourOfDay = context.parsed.x ?? 0;
              const hour = Math.floor(hourOfDay);
              const minute = Math.round((hourOfDay - hour) * 60);
              const duration = Math.round(context.parsed.y ?? 0);
              const time = `${hour}:${String(minute).padStart(2, '0')}`;
              return `${context.dataset.label}: ${time} - ${duration} min`;
            },
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: 24,
          ticks: {
            font: { size: 10 },
            stepSize: 3,
            callback: (value) => formatHour(Number(value)),
          },
          title: { display: true, text: 'Time of Day', font: { size: 11 } },
        },
        y: {
          min: 0,
          ticks: { font: { size: 11 } },
          title: { display: true, text: 'Duration (min)', font: { size: 11 } },
        },
      },
    };
  });

  protected changeYear(delta: number): void {
    this.yearChange.emit(this.year() + delta);
  }
}

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}
