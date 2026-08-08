import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { type PageTurnerStats } from '../../../../data/user/page-turner-stats';
import {
  StatsCategoricalBarComponent,
  type StatsCategoricalBarPlot,
} from '../../../shared/stats-categorical-bar.component';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import {
  StatsChartSummaryComponent,
  type StatsChartSummaryItem,
} from '../../../shared/stats-chart-summary.component';

const LABEL_LIMIT = 25;
const CHART_LIMIT = 15;
const HIGHLIGHT_LIMIT = 3;

@Component({
  selector: 'app-page-turner-chart',
  standalone: true,
  imports: [
    StatsCategoricalBarComponent,
    StatsChartCardComponent,
    StatsChartSummaryComponent,
    TranslocoDirective,
  ],
  templateUrl: './page-turner-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class PageTurnerChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<PageTurnerStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartRanking = computed(() => this.stats().ranking.slice(0, CHART_LIMIT));
  readonly highlights = computed(() => this.stats().ranking.slice(0, HIGHLIGHT_LIMIT));
  readonly mostGripping = computed(() => this.stats().ranking[0] ?? null);
  readonly guiltyPleasure = computed(
    () => this.stats().ranking.find(
      (book) => book.gripScore >= 60 && book.personalRating !== null && book.personalRating <= 3,
    ) ?? null,
  );
  readonly summaryItems = computed<readonly StatsChartSummaryItem[]>(() => {
    this.activeLanguage();
    const mostGripping = this.mostGripping();
    const guiltyPleasure = this.guiltyPleasure();
    return [
      {
        label: this.transloco.translate('statsUser.pageTurner.mostGripping'),
        value: mostGripping?.bookTitle ?? '—',
        valueTitle: mostGripping?.bookTitle,
        truncateValue: true,
      },
      {
        label: this.transloco.translate('statsUser.pageTurner.avgGripScore'),
        value: this.stats().averageGripScore,
      },
      {
        label: this.transloco.translate('statsUser.pageTurner.guiltyPleasure'),
        value: guiltyPleasure?.bookTitle ?? '—',
        valueTitle: guiltyPleasure?.bookTitle,
        truncateValue: true,
      },
    ];
  });
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().ranking.length > 0 ? 'ready' : 'empty';
  });
  readonly plot = computed<StatsCategoricalBarPlot>(() => {
    this.activeLanguage();
    const ranking = this.chartRanking();
    return {
      categories: ranking.map((book) => ({ label: truncate(book.bookTitle, LABEL_LIMIT) })),
      series: [{
        label: this.transloco.translate('statsUser.pageTurner.gripScore'),
        color: 'rgba(251, 146, 60, 0.85)',
        values: ranking.map((book) => {
          const color = gripColor(book.gripScore);
          const tooltipLines = [
            this.transloco.translate('statsUser.pageTurner.tooltipGripScore', { score: book.gripScore }),
            this.transloco.translate('statsUser.pageTurner.tooltipSessions', { count: book.totalSessions }),
            this.transloco.translate('statsUser.pageTurner.tooltipAvgSession', {
              minutes: Math.round(book.avgSessionDurationSeconds / 60),
            }),
          ];
          if (book.personalRating !== null) {
            tooltipLines.push(this.transloco.translate('statsUser.pageTurner.tooltipRating', {
              rating: book.personalRating,
            }));
          }
          return {
            value: book.gripScore,
            color,
            borderColor: color.replace('0.85', '1'),
            tooltipLines,
          };
        }),
      }],
      orientation: 'horizontal',
      primaryAxis: {
        title: this.transloco.translate('statsUser.pageTurner.axisGripScore'),
        minimum: 0,
        maximum: 100,
      },
      categoryPercentage: 0.7,
      axisStyle: 'strong',
      tooltipStyle: { kind: 'rich-accent', accent: 'rgba(251, 146, 60, 0.8)' },
    };
  });
}

function gripColor(gripScore: number): string {
  const ratio = gripScore / 100;
  const red = Math.round(59 + ratio * (239 - 59));
  const green = Math.round(130 + ratio * (68 - 130));
  const blue = Math.round(246 + ratio * (68 - 246));
  return `rgba(${red}, ${green}, ${blue}, 0.85)`;
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength)}…` : value;
}
