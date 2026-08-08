import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input } from '@angular/core';

import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Chart, type ChartConfiguration, type ChartData, type TooltipModel } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { type AuthorUniverseStats } from '../../../../data/library/author-universe-stats';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';
import {
  StatsChartLegendComponent,
  type StatsChartLegendItem,
} from '../../../shared/stats-chart-legend.component';
import {
  StatsChartSummaryComponent,
  type StatsChartSummaryItem,
} from '../../../shared/stats-chart-summary.component';
import { StatsChartThemeService } from '../../../shared/stats-chart-theme.service';

interface AuthorStats {
  name: string;
  bookCount: number;
  totalPages: number;
  avgRating: number;
  readCount: number;
  completionRate: number;
  categories: readonly string[];
}

interface BubbleDataPoint {
  x: number;
  y: number;
  r: number;
  authorStats: AuthorStats;
}

type AuthorUniverseChartData = ChartData<'bubble', BubbleDataPoint[], string>;
type AuthorUniverseAuthor = AuthorUniverseStats['authors'][number];
type AuthorUniverseInsights = NonNullable<AuthorUniverseStats['insights']>;

const COMPLETION_COLORS = {
  high: '#22c55e',
  medium: '#f59e0b',
  low: '#3b82f6',
  minimal: '#8b5cf6',
  unread: '#6b7280',
};

const INSIGHT_LABEL_SEPARATOR = /[:：]\s*/;

@Component({
  selector: 'app-author-universe-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [
    BaseChartDirective,
    StatsChartCardComponent,
    StatsChartLegendComponent,
    StatsChartSummaryComponent,
    TranslocoDirective,
  ],
  templateUrl: './author-universe-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class AuthorUniverseChartComponent {
  private readonly t = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chartTheme = inject(StatsChartThemeService);

  readonly stats = input.required<AuthorUniverseStats>();
  readonly loading = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'bubble' as const;
  readonly authors = computed<AuthorStats[]>(() => this.stats().authors.map(this.toChartAuthor));
  readonly totalAuthors = computed(() => this.authors().length);
  readonly insights = computed(() => this.buildInsights(this.stats().insights));
  readonly insightTiles = computed<readonly StatsChartSummaryItem[]>(() =>
    this.insights().map(toInsightTile),
  );
  readonly chartData = computed<AuthorUniverseChartData>(() => this.buildChartData(this.authors()));
  readonly state = computed<StatsChartState>(() => {
    if (this.loading()) return 'loading';
    return this.totalAuthors() > 0 ? 'ready' : 'empty';
  });
  readonly legend = computed<readonly StatsChartLegendItem[]>(() =>
    this.chartData().datasets.map(dataset => ({
      label: dataset.label ?? '',
      color: typeof dataset.borderColor === 'string' ? dataset.borderColor : '#6b7280',
    })),
  );

  readonly chartOptions: ChartConfiguration<'bubble'>['options'] = {
    layout: {padding: {top: 20, right: 20, bottom: 20, left: 20}},
    scales: {
      x: {
        title: {
          display: true,
          text: this.t.translate('statsLibrary.authorUniverse.axisBooks'),
          font: {family: "'Inter', sans-serif", size: 12, weight: 500},
        },
        ticks: {font: {family: "'Inter', sans-serif", size: 11}, precision: 0, stepSize: 1},
        border: {display: false},
        min: 0,
      },
      y: {
        title: {
          display: true,
          text: this.t.translate('statsLibrary.authorUniverse.axisRating'),
          font: {family: "'Inter', sans-serif", size: 12, weight: 500},
        },
        ticks: {
          font: {family: "'Inter', sans-serif", size: 11},
          callback: value => value.toLocaleString(),
        },
        border: {display: false},
        min: 0,
        max: 5.5,
        beginAtZero: true,
      },
    },
    plugins: {
      tooltip: {
        enabled: false,
        external: context => this.handleExternalTooltip(context),
      },
    },
    interaction: {intersect: true, mode: 'nearest'},
  };

  constructor() {
    this.destroyRef.onDestroy(() => document.getElementById('author-chart-tooltip')?.remove());
  }

  private readonly toChartAuthor = (author: AuthorUniverseAuthor): AuthorStats => ({
    name: author.name,
    bookCount: author.bookCount,
    totalPages: author.totalPages,
    avgRating: author.averageRating,
    readCount: author.readCount,
    completionRate: author.completionPercent,
    categories: author.topGenres,
  });

  private buildChartData(authorStats: readonly AuthorStats[]): AuthorUniverseChartData {
    if (authorStats.length === 0) return {labels: [], datasets: []};

    const grouped = {
      high: [] as BubbleDataPoint[],
      medium: [] as BubbleDataPoint[],
      low: [] as BubbleDataPoint[],
      minimal: [] as BubbleDataPoint[],
      unread: [] as BubbleDataPoint[],
    };
    const maxPages = Math.max(...authorStats.map(author => author.totalPages), 1);

    for (const author of authorStats) {
      const point: BubbleDataPoint = {
        x: author.bookCount,
        y: author.avgRating || 2.5,
        r: Math.max(5, Math.min(25, 5 + (author.totalPages / maxPages) * 20)),
        authorStats: author,
      };

      if (author.completionRate >= 75) grouped.high.push(point);
      else if (author.completionRate >= 50) grouped.medium.push(point);
      else if (author.completionRate >= 25) grouped.low.push(point);
      else if (author.completionRate > 0) grouped.minimal.push(point);
      else grouped.unread.push(point);
    }

    const definitions = [
      {key: 'high', label: 'legend75to100'},
      {key: 'medium', label: 'legend50to74'},
      {key: 'low', label: 'legend25to49'},
      {key: 'minimal', label: 'legend1to24'},
      {key: 'unread', label: 'legendUnread'},
    ] as const;

    return {
      labels: [],
      datasets: definitions
        .filter(definition => grouped[definition.key].length > 0)
        .map(definition => ({
          label: this.t.translate(`statsLibrary.authorUniverse.${definition.label}`),
          data: grouped[definition.key],
          backgroundColor: this.hexToRgba(COMPLETION_COLORS[definition.key], 0.6),
          borderColor: COMPLETION_COLORS[definition.key],
          borderWidth: 2,
          hoverBorderWidth: 3,
        })),
    };
  }

  private buildInsights(stats: AuthorUniverseInsights | null): string[] {
    if (!stats) return [];

    const insights: string[] = [];
    if (stats.mostCollected) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightMostCollected', stats.mostCollected));
    }
    if (stats.highestRated) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightHighestRated', {
        name: stats.highestRated.name,
        rating: `${stats.highestRated.averageRating.toFixed(1)}★`,
      }));
    }
    if (stats.mostPages) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightMostPages', stats.mostPages));
    }
    if (stats.bestCompletion) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightMostRead', {
        name: stats.bestCompletion.name,
        percent: stats.bestCompletion.count,
      }));
    }
    if (stats.hiddenGem) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightHiddenGem', {
        name: stats.hiddenGem.name,
        rating: `${stats.hiddenGem.averageRating.toFixed(1)}★`,
        count: stats.hiddenGem.bookCount,
      }));
    }
    if (stats.biggestBacklog) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightBiggestBacklog', stats.biggestBacklog));
    }
    if (stats.topThreeSharePercent !== null) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightTop3Concentration', {
        percent: stats.topThreeSharePercent,
      }));
    }
    if (stats.longestReads) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightLongestReads', {
        name: stats.longestReads.name,
        pages: stats.longestReads.count,
      }));
    }
    if (stats.mostVersatile) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightMostVersatile', stats.mostVersatile));
    }
    if (stats.untouchedAuthor) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightUntouchedAuthor', stats.untouchedAuthor));
    }
    if (stats.overallProgressPercent !== null) {
      insights.push(this.t.translate('statsLibrary.authorUniverse.insightOverallProgress', {
        percent: stats.overallProgressPercent,
      }));
    }
    return insights;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private handleExternalTooltip(context: {chart: Chart; tooltip: TooltipModel<'bubble'>}): void {
    const {chart, tooltip} = context;
    const colors = this.chartTheme.colors();
    let tooltipEl = document.getElementById('author-chart-tooltip');

    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'author-chart-tooltip';
      Object.assign(tooltipEl.style, {
        position: 'fixed',
        zIndex: '9999',
        borderRadius: '8px',
        padding: '12px 16px',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 0.15s ease',
        transform: 'translate(-50%, calc(-100% - 12px))',
        maxWidth: '280px',
        whiteSpace: 'nowrap',
        fontFamily: "'Inter', sans-serif",
      });
      document.body.appendChild(tooltipEl);
    }

    tooltipEl.style.background = colors.surface;
    tooltipEl.style.border = `1px solid ${colors.border}`;
    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = '0';
      return;
    }

    const dataPoint = tooltip.dataPoints?.[0];
    if (!dataPoint) {
      tooltipEl.style.opacity = '0';
      return;
    }

    const stats = (dataPoint.raw as BubbleDataPoint).authorStats;
    const ratingText = stats.avgRating > 0
      ? `${stats.avgRating.toFixed(2)} ★`
      : this.t.translate('statsLibrary.authorUniverse.tooltipNoRatings');
    const safeGenres = this.escapeHtml(stats.categories.slice(0, 3).join(', '));
    const categoriesHtml = stats.categories.length > 0
      ? `<div style="color:${colors.textSecondary};font-size:12px;line-height:1.6">${this.t.translate('statsLibrary.authorUniverse.tooltipGenres', {genres: safeGenres})}</div>`
      : '';
    const booksLine = this.t.translate('statsLibrary.authorUniverse.tooltipBooks', {count: stats.bookCount});
    const pagesLine = this.t.translate('statsLibrary.authorUniverse.tooltipTotalPages', {count: stats.totalPages.toLocaleString()});
    const ratingLine = this.t.translate('statsLibrary.authorUniverse.tooltipAvgRating', {rating: ratingText});
    const readLine = this.t.translate('statsLibrary.authorUniverse.tooltipRead', {
      read: stats.readCount,
      total: stats.bookCount,
      percent: Math.round(stats.completionRate),
    });

    tooltipEl.innerHTML = `
      <div style="color:${colors.text};font-size:14px;font-weight:700;margin-bottom:6px">${this.escapeHtml(stats.name)}</div>
      <div style="color:${colors.textSecondary};font-size:12px;line-height:1.6">${booksLine}</div>
      <div style="color:${colors.textSecondary};font-size:12px;line-height:1.6">${pagesLine}</div>
      <div style="color:${colors.textSecondary};font-size:12px;line-height:1.6">${ratingLine}</div>
      <div style="color:${colors.textSecondary};font-size:12px;line-height:1.6">${readLine}</div>
      ${categoriesHtml}
    `;

    const canvasRect = chart.canvas.getBoundingClientRect();
    tooltipEl.style.opacity = '1';
    tooltipEl.style.left = `${canvasRect.left + tooltip.caretX}px`;
    tooltipEl.style.top = `${canvasRect.top + tooltip.caretY}px`;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

function toInsightTile(line: string): StatsChartSummaryItem {
  const separator = INSIGHT_LABEL_SEPARATOR.exec(line);
  if (!separator) return { label: line, value: '', truncateValue: true };

  return {
    label: line.slice(0, separator.index),
    value: line.slice(separator.index + separator[0].length),
    valueTitle: line.slice(separator.index + separator[0].length),
    truncateValue: true,
  };
}
