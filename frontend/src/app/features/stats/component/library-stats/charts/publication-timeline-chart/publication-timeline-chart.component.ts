import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import {
  PRE_1900_DECADE_START,
  PublicationTimelineStats,
} from '../../../../data/library/publication-timeline-stats';
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

const DECADE_COLORS: Record<string, string> = {
  pre1900: '#92400e',
  '1900s': '#b45309',
  '1910s': '#c2410c',
  '1920s': '#d97706',
  '1930s': '#e5932d',
  '1940s': '#eab308',
  '1950s': '#a3e635',
  '1960s': '#4ade80',
  '1970s': '#22d3ee',
  '1980s': '#38bdf8',
  '1990s': '#60a5fa',
  '2000s': '#818cf8',
  '2010s': '#a78bfa',
  '2020s': '#c084fc',
};

@Component({
  selector: 'app-publication-timeline-chart',
  standalone: true,
  imports: [
    StatsCategoricalBarComponent,
    StatsChartCardComponent,
    StatsChartSummaryComponent,
    TranslocoDirective,
  ],
  templateUrl: './publication-timeline-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class PublicationTimelineChartComponent {
  private readonly t = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.t.langChanges$, {
    initialValue: this.t.getActiveLang(),
  });

  readonly stats = input.required<PublicationTimelineStats>();
  readonly loading = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly state = computed<StatsChartState>(() => {
    if (this.loading()) return 'loading';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });
  readonly plot = computed<StatsCategoricalBarPlot>(() => {
    this.activeLanguage();
    const decades = this.stats().decades;
    return {
      categories: decades.map((decade) => ({ label: this.decadeLabel(decade.decadeStart) })),
      series: [{
        label: '',
        color: '#6B7280',
        values: decades.map((decade) => {
          const color = DECADE_COLORS[this.decadeKey(decade.decadeStart)] ?? '#6B7280';
          return {
            value: decade.bookCount,
            color,
            borderColor: color,
            tooltipLines: [this.t.translate(
              decade.bookCount === 1
                ? 'statsLibrary.publicationTimeline.tooltipBook'
                : 'statsLibrary.publicationTimeline.tooltipBooks',
              { value: decade.bookCount },
            )],
          };
        }),
      }],
      orientation: 'horizontal',
      primaryAxis: {
        title: this.t.translate('statsLibrary.publicationTimeline.axisNumberOfBooks'),
        stepSize: 1,
        precision: 0,
      },
      categoryPercentage: 0.85,
      padding: { top: 10, right: 20, bottom: 10, left: 10 },
      axisStyle: 'library-horizontal',
      tooltipStyle: { kind: 'compact-accent', accent: '#a78bfa' },
    };
  });
  readonly summaryItems = computed<readonly StatsChartSummaryItem[]>(() => {
    this.activeLanguage();
    const insights = this.stats().insights;
    if (!insights) return [];

    return [
      {
        label: this.t.translate('statsLibrary.publicationTimeline.insightOldest'),
        value: insights.oldestBook?.year ?? '—',
        detail: insights.oldestBook?.title ?? '—',
        detailTitle: insights.oldestBook?.title ?? '',
        truncateDetail: true,
      },
      {
        label: this.t.translate('statsLibrary.publicationTimeline.insightAverageYear'),
        value: insights.averageYear,
        detail: this.t.translate('statsLibrary.publicationTimeline.insightMedian', { year: insights.medianYear }),
      },
      {
        label: this.t.translate('statsLibrary.publicationTimeline.insightNewest'),
        value: insights.newestBook?.year ?? '—',
        detail: insights.newestBook?.title ?? '—',
        detailTitle: insights.newestBook?.title ?? '',
        truncateDetail: true,
      },
      {
        label: this.t.translate('statsLibrary.publicationTimeline.insightMostCommonYear'),
        value: insights.mostCommonYear?.year ?? '—',
        detail: this.t.translate('statsLibrary.publicationTimeline.insightMostCommonYearBooks', {
          count: this.formatCount(insights.mostCommonYear?.bookCount ?? 0),
        }),
      },
      {
        label: this.t.translate('statsLibrary.publicationTimeline.insightTimeSpan'),
        value: this.formatCount(insights.yearSpan),
        detail: this.t.translate('statsLibrary.publicationTimeline.insightYearsOfLiterature'),
      },
      {
        label: this.t.translate('statsLibrary.publicationTimeline.insightPeakDecade'),
        value: insights.peakDecade ? this.decadeLabel(insights.peakDecade.decadeStart) : '—',
        detail: this.t.translate('statsLibrary.publicationTimeline.insightPeakDecadeBooks', {
          count: this.formatCount(insights.peakDecade?.bookCount ?? 0),
        }),
      },
      {
        label: this.t.translate('statsLibrary.publicationTimeline.insightGoldenEra'),
        value: insights.goldenEra
          ? `${insights.goldenEra.startYear}–${insights.goldenEra.endYear}`
          : '—',
        detail: this.t.translate('statsLibrary.publicationTimeline.insightGoldenEraRange', {
          count: this.formatCount(insights.goldenEra?.bookCount ?? 0),
        }),
      },
      {
        label: this.t.translate('statsLibrary.publicationTimeline.insightRarityScore'),
        value: this.formatPercent(insights.rarityPercent),
        detail: this.t.translate('statsLibrary.publicationTimeline.insightRarePicks'),
      },
    ];
  });

  private decadeKey(decadeStart: number): string {
    if (decadeStart < 1900) return 'pre1900';
    if (decadeStart >= 2020) return '2020s';
    return `${decadeStart}s`;
  }

  protected decadeLabel(decadeStart: number): string {
    return decadeStart === PRE_1900_DECADE_START ? 'Pre-1900' : `${decadeStart}s`;
  }

  protected formatCount(value: number): string {
    return value.toLocaleString(this.t.getActiveLang());
  }

  private formatPercent(value: number): string {
    return new Intl.NumberFormat(this.t.getActiveLang(), { style: 'percent' }).format(value / 100);
  }
}
