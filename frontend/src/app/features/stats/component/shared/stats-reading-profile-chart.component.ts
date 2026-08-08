import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import {
  type ReadingDnaStats,
  type ReadingDnaTraitId,
} from '../../data/user/reading-dna-stats';
import {
  type ReadingHabitId,
  type ReadingHabitsStats,
} from '../../data/user/reading-habits-stats';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from './stats-chart-card.component';
import { StatsChartJsHostDirective } from './stats-chart-js-host.directive';

export type StatsReadingProfile =
  | { readonly kind: 'dna'; readonly stats: ReadingDnaStats }
  | { readonly kind: 'habits'; readonly stats: ReadingHabitsStats };

interface ProfileMetric {
  readonly id: string;
  readonly label: string;
  readonly score: number;
  readonly formattedScore: string;
  readonly description: string;
  readonly color: string;
  readonly tooltipTitle: string;
  readonly tooltipScore: string;
}

interface ProfileView {
  readonly heading: string;
  readonly description: string;
  readonly datasetLabel: string;
  readonly lineColor: string;
  readonly fillColor: string;
  readonly metrics: readonly ProfileMetric[];
  readonly fallbackDescription: string;
}

interface ProfileDefinition {
  readonly prefix: 'statsUser.readingDna' | 'statsUser.readingHabits';
  readonly labels: 'traits' | 'habits';
  readonly dataset: 'readingDnaProfile' | 'readingHabitsProfile';
  readonly tooltipTitle: 'tooltipPersonality' | 'tooltipHabit';
  readonly lineColor: string;
  readonly fillColor: string;
  readonly colors: Readonly<Record<string, string>>;
}

const DNA_COLORS: Readonly<Record<ReadingDnaTraitId, string>> = {
  adventurous: '#e91e63',
  perfectionist: '#2196f3',
  intellectual: '#00bcd4',
  emotional: '#ff9800',
  patient: '#9c27b0',
  social: '#3f51b5',
  nostalgic: '#673ab7',
  ambitious: '#009688',
};

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

const PROFILE_DEFINITIONS: Readonly<Record<StatsReadingProfile['kind'], ProfileDefinition>> = {
  dna: {
    prefix: 'statsUser.readingDna',
    labels: 'traits',
    dataset: 'readingDnaProfile',
    tooltipTitle: 'tooltipPersonality',
    lineColor: '#e91e63',
    fillColor: 'rgba(233, 30, 99, 0.2)',
    colors: DNA_COLORS,
  },
  habits: {
    prefix: 'statsUser.readingHabits',
    labels: 'habits',
    dataset: 'readingHabitsProfile',
    tooltipTitle: 'tooltipHabit',
    lineColor: '#9c27b0',
    fillColor: 'rgba(156, 39, 176, 0.2)',
    colors: HABIT_COLORS,
  },
};

@Component({
  selector: 'app-stats-reading-profile-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent],
  template: `
    <app-stats-chart-card
      [heading]="view().heading"
      [description]="view().description"
      [showDescription]="showDescription()"
      [loadingMessage]="loadingMessage()"
      [plotHeight]="plotHeight()"
      [state]="state()">
      @if (state() === 'ready') {
        <div class="relative" [style.height.px]="plotHeight()">
          <canvas
            baseChart
            [data]="chartData()"
            [options]="chartOptions()"
            type="radar"></canvas>
        </div>
      }

      @if (state() === 'ready') {
        <dl
          statsChartSummary
          class="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">
          @for (metric of view().metrics; track metric.id) {
            <div class="min-w-0">
              <dt class="text-xs font-medium text-text-secondary">{{ metric.label }}</dt>
              <dd class="mt-1 text-lg font-semibold tabular-nums text-text-strong">
                {{ metric.formattedScore }}
              </dd>
              <dd class="min-h-16 line-clamp-4 text-xs tabular-nums text-text-muted">
                {{ metric.description }}
              </dd>
            </div>
          }
        </dl>
      }
    </app-stats-chart-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class StatsReadingProfileChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly profile = input.required<StatsReadingProfile>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.profile().stats.length > 0 ? 'ready' : 'empty';
  });

  readonly view = computed<ProfileView>(() => {
    const language = this.activeLanguage();
    const profile = this.profile();
    const definition = PROFILE_DEFINITIONS[profile.kind];
    const metrics = profile.stats.map((metric) => {
      const label = this.translate(`${definition.prefix}.${definition.labels}.${metric.id}`);
      return {
        id: metric.id,
        label,
        score: metric.score,
        formattedScore: metric.score.toLocaleString(language),
        description: this.translate(
          `${definition.prefix}.descriptions.${metric.id}.${metric.level}`,
        ),
        color: definition.colors[metric.id] ?? definition.lineColor,
        tooltipTitle: this.translate(`${definition.prefix}.${definition.tooltipTitle}`, { label }),
        tooltipScore: this.translate(`${definition.prefix}.tooltipScore`, { score: metric.score }),
      };
    });

    return {
      heading: this.translate(`${definition.prefix}.title`),
      description: this.translate(`${definition.prefix}.description`),
      datasetLabel: this.translate(`${definition.prefix}.${definition.dataset}`),
      lineColor: definition.lineColor,
      fillColor: definition.fillColor,
      metrics,
      fallbackDescription: this.translate(`${definition.prefix}.tooltipDefaultDescription`),
    };
  });

  readonly chartData = computed<ChartData<'radar', number[], string>>(() => {
    const view = this.view();
    if (view.metrics.length === 0) return { labels: [], datasets: [] };

    return {
      labels: view.metrics.map((metric) => metric.label),
      datasets: [{
        label: view.datasetLabel,
        data: view.metrics.map((metric) => metric.score),
        backgroundColor: view.fillColor,
        borderColor: view.lineColor,
        borderWidth: 3,
        pointBackgroundColor: view.metrics.map((metric) => metric.color),
        pointBorderWidth: 3,
        pointRadius: 5,
        pointHoverRadius: 8,
        fill: true,
      }],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'radar'>['options']>(() => {
    const view = this.view();
    return {
      layout: { padding: { top: 15 } },
      scales: { r: {
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
      } },
      plugins: { tooltip: {
        borderColor: view.lineColor,
        borderWidth: 2,
        cornerRadius: 8,
        padding: 16,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        callbacks: {
          title: (context) =>
            view.metrics.at(context[0]?.dataIndex ?? -1)?.tooltipTitle ?? '',
          label: (context) => {
            const metric = view.metrics.at(context.dataIndex);
            return [
              metric?.tooltipScore ?? '',
              '',
              metric?.description ?? view.fallbackDescription,
            ];
          },
        },
      } },
      interaction: { intersect: false, mode: 'point' },
      elements: {
        line: { borderWidth: 3, tension: 0.1 },
        point: { radius: 5, hoverRadius: 8, borderWidth: 3 },
      },
    };
  });

  private translate(key: string, params?: Record<string, number | string>): string {
    return this.transloco.translate(key, params);
  }
}
