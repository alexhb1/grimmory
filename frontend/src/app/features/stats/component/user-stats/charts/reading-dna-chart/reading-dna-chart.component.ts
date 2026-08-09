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
  type ReadingDnaStats,
  type ReadingDnaTraitId,
} from '../../../../data/user/reading-dna-stats';

interface ReadingDnaTraitView {
  readonly id: ReadingDnaTraitId;
  readonly label: string;
  readonly score: number;
  readonly description: string;
  readonly color: string;
}

const TRAIT_COLORS: Readonly<Record<ReadingDnaTraitId, string>> = {
  adventurous: '#e91e63',
  perfectionist: '#2196f3',
  intellectual: '#00bcd4',
  emotional: '#ff9800',
  patient: '#9c27b0',
  social: '#3f51b5',
  nostalgic: '#673ab7',
  ambitious: '#009688',
};

const TRAIT_ICONS: readonly string[] = ['🌟', '💎', '🧠', '💖', '🕰️', '👥', '📚', '🚀'];

@Component({
  selector: 'app-reading-dna-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './reading-dna-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadingDNAChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<ReadingDnaStats>();
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

  readonly traits = computed<readonly ReadingDnaTraitView[]>(() => {
    this.activeLanguage();
    return this.stats().map((trait) => ({
      id: trait.id,
      label: this.transloco.translate(`statsUser.readingDna.traits.${trait.id}`),
      score: trait.score,
      description: this.transloco.translate(
        `statsUser.readingDna.descriptions.${trait.id}.${trait.level}`,
      ),
      color: TRAIT_COLORS[trait.id],
    }));
  });

  readonly chartData = computed<ChartData<'radar', number[], string>>(() => {
    const traits = this.traits();
    if (traits.length === 0) return { labels: [], datasets: [] };

    return {
      labels: traits.map((trait) => trait.label),
      datasets: [
        {
          label: this.transloco.translate('statsUser.readingDna.readingDnaProfile'),
          data: traits.map((trait) => trait.score),
          backgroundColor: 'rgba(233, 30, 99, 0.2)',
          borderColor: '#e91e63',
          borderWidth: 3,
          pointBackgroundColor: traits.map((trait) => trait.color),
          pointBorderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 8,
          fill: true,
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'radar'>['options']>(() => {
    const traits = this.traits();

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
            callback: (label: string) => {
              const index = traits.findIndex((entry) => entry.label === label);
              return [TRAIT_ICONS[index] ?? '', label];
            },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderColor: '#e91e63',
          borderWidth: 2,
          cornerRadius: 8,
          padding: 16,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            title: (context) =>
              this.transloco.translate('statsUser.readingDna.tooltipPersonality', {
                label: context[0]?.label ?? '',
              }),
            label: (context) => {
              const trait = traits.find((entry) => entry.label === context.label);
              return [
                this.transloco.translate('statsUser.readingDna.tooltipScore', {
                  score: context.parsed.r,
                }),
                '',
                trait
                  ? trait.description
                  : this.transloco.translate('statsUser.readingDna.tooltipDefaultDescription'),
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
    return `${value.toLocaleString(this.activeLanguage())}%`;
  }
}
