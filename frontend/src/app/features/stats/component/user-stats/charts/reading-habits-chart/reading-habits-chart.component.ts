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
import {
  type ReadingHabitId,
  type ReadingHabitsStats,
} from '../../../../data/user/reading-habits-stats';

interface ReadingHabitView {
  readonly id: ReadingHabitId;
  readonly label: string;
  readonly score: number;
  readonly description: string;
  readonly color: string;
}

const HABIT_COLORS: Readonly<Record<ReadingHabitId, string>> = {
  consistency: '#9c27b0',
  multitasking: '#e91e63',
  completionism: '#ff5722',
  exploration: '#ff9800',
  organization: '#ffc107',
  intensity: '#4caf50',
  methodology: '#2196f3',
  momentum: '#673ab7',
};

@Component({
  selector: 'app-reading-habits-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './reading-habits-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadingHabitsChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<ReadingHabitsStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'radar' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().length > 0 ? 'ready' : 'empty';
  });

  readonly habits = computed<readonly ReadingHabitView[]>(() => {
    this.activeLanguage();
    return this.stats().map((habit) => ({
      id: habit.id,
      label: this.transloco.translate(`statsUser.readingHabits.habits.${habit.id}`),
      score: habit.score,
      description: this.transloco.translate(
        `statsUser.readingHabits.descriptions.${habit.id}.${habit.level}`,
      ),
      color: HABIT_COLORS[habit.id],
    }));
  });

  readonly chartData = computed<ChartData<'radar', number[], string>>(() => {
    const habits = this.habits();
    if (habits.length === 0) return { labels: [], datasets: [] };

    return {
      labels: habits.map((habit) => habit.label),
      datasets: [
        {
          label: this.transloco.translate('statsUser.readingHabits.readingHabitsProfile'),
          data: habits.map((habit) => habit.score),
          backgroundColor: 'rgba(156, 39, 176, 0.2)',
          borderColor: '#9c27b0',
          borderWidth: 3,
          pointBackgroundColor: habits.map((habit) => habit.color),
          pointBorderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 8,
          fill: true,
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'radar'>['options']>(() => {
    const habits = this.habits();

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 15 } },
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            font: { family: "'Inter', sans-serif", size: 12 },
            backdropColor: 'transparent',
            showLabelBackdrop: false,
          },
          grid: { circular: true },
          pointLabels: {
            font: { family: "'Inter', sans-serif", size: 12 },
            padding: 25,
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderColor: '#9c27b0',
          borderWidth: 2,
          cornerRadius: 8,
          padding: 16,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            title: (context) =>
              this.transloco.translate('statsUser.readingHabits.tooltipHabit', {
                label: context[0]?.label ?? '',
              }),
            label: (context) => {
              const habit = habits.find((entry) => entry.label === context.label);
              return [
                this.transloco.translate('statsUser.readingHabits.tooltipScore', {
                  score: context.parsed.r,
                }),
                '',
                habit
                  ? habit.description
                  : this.transloco.translate('statsUser.readingHabits.tooltipDefaultDescription'),
              ];
            },
          },
        },
      },
      interaction: { intersect: false, mode: 'point' },
      elements: {
        line: { borderWidth: 3, tension: 0.1 },
        point: { radius: 5, hoverRadius: 8, borderWidth: 3 },
      },
    };
  });

  protected formatScore(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }
}
