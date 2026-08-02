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
import { type SessionArchetypeStats } from '../../../../data/user/session-archetypes-stats';

type SessionArchetypeChartData = ChartData<'scatter', { x: number; y: number }[], string>;

interface SessionArchetypeLegendEntry {
  readonly dayOfWeek: number;
  readonly label: string;
  readonly color: string;
}

const DAY_COLORS: readonly string[] = [
  '#ef5350',
  '#ff9800',
  '#ffc107',
  '#66bb6a',
  '#42a5f5',
  '#7e57c2',
  '#ec407a',
];

@Component({
  selector: 'app-session-archetypes-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [AppSelectComponent, BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
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
  readonly yearOptions = input<readonly number[]>([]);
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly yearChange = output<number>();

  readonly chartType = 'scatter' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'ready';
    return this.stats().sessionCount > 0 ? 'ready' : 'empty';
  });

  readonly yearSelectOptions = computed<readonly SelectOption<number>[]>(() => {
    return this.yearOptions().map((year) => ({ value: year, label: String(year) }));
  });
  readonly yearSelectorLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.peakHours.selectYear');
  });
  readonly dominantArchetypeLabel = computed(() => {
    this.activeLanguage();
    const archetype = this.stats().dominantArchetype;
    return archetype === null
      ? '—'
      : this.transloco.translate(`statsUser.sessionArchetypes.archetype_${archetype}`);
  });
  readonly legend = computed<readonly SessionArchetypeLegendEntry[]>(() => {
    const locale = this.activeLanguage();
    return this.stats().days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      label: formatDayName(day.dayOfWeek, locale),
      color: DAY_COLORS[(day.dayOfWeek - 1) % DAY_COLORS.length],
    }));
  });

  readonly chartData = computed<SessionArchetypeChartData>(() => {
    const legend = this.legend();

    return {
      datasets: this.stats().days.map((day, index) => ({
        label: legend[index].label,
        data: day.points.map((point) => ({ x: point.hourOfDay, y: point.durationMinutes })),
        backgroundColor: `${legend[index].color}AA`,
        borderColor: legend[index].color,
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 8,
      })),
    };
  });

  readonly chartOptions = computed<ChartOptions<'scatter'>>(() => {
    const locale = this.activeLanguage();

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      layout: { padding: { top: 10, right: 20 } },
      plugins: {
        legend: { display: false },
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
            callback: (value) => formatHour(Number(value), locale),
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

  protected onYearChange(year: number | null): void {
    if (year !== null) this.yearChange.emit(year);
  }
}

function formatDayName(dayOfWeek: number, locale: string): string {
  return new Date(2000, 0, 1 + dayOfWeek).toLocaleDateString(locale, { weekday: 'short' });
}

function formatHour(hour: number, locale: string): string {
  return new Date(2000, 0, 1, hour % 24).toLocaleTimeString(locale, { hour: 'numeric' });
}
