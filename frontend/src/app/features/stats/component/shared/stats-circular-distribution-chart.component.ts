import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { ReadStatus } from '../../../book/model/book.model';
import { type BookFormatStats } from '../../data/library/book-format-stats';
import { type LanguageStats } from '../../data/library/language-stats';
import { type MetadataScoreStats } from '../../data/library/metadata-score-stats';
import { type ReadStatusStats } from '../../data/user/read-status-stats';
import {
  type ReadingProgressBandId,
  type ReadingProgressStats,
} from '../../data/user/reading-progress-stats';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from './stats-chart-card.component';
import { StatsChartJsHostDirective } from './stats-chart-js-host.directive';
import {
  StatsChartLegendComponent,
  type StatsChartLegendItem,
} from './stats-chart-legend.component';
import { StatsCircularChartLayoutComponent } from './stats-circular-chart-layout.component';

export type StatsCircularDistribution =
  | { readonly kind: 'book-formats'; readonly stats: BookFormatStats }
  | { readonly kind: 'languages'; readonly stats: LanguageStats }
  | { readonly kind: 'metadata-score'; readonly stats: MetadataScoreStats }
  | { readonly kind: 'read-status'; readonly stats: ReadStatusStats }
  | { readonly kind: 'reading-progress'; readonly stats: ReadingProgressStats };

interface DistributionRow extends StatsChartLegendItem {
  readonly id: string;
  readonly count: number;
  readonly tooltip: string;
}

interface DistributionView {
  readonly heading: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly type: 'pie' | 'doughnut';
  readonly rows: readonly DistributionRow[];
  readonly datasetLabel?: string;
  readonly averageLabel?: string;
  readonly averageValue?: string;
}

const FORMAT_COLORS: Readonly<Record<string, string>> = {
  PDF: '#E11D48',
  EPUB: '#0D9488',
  CBX: '#7C3AED',
  FB2: '#F59E0B',
  MOBI: '#2563EB',
  AZW3: '#16A34A',
};

const LANGUAGE_COLORS = [
  '#2563EB', '#0D9488', '#7C3AED', '#DC2626', '#F59E0B',
  '#16A34A', '#EC4899', '#8B5CF6', '#06B6D4', '#EA580C',
  '#6366F1', '#14B8A6', '#F43F5E', '#84CC16', '#A855F7',
] as const;

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: 'English', eng: 'English', english: 'English',
  es: 'Spanish', spa: 'Spanish', spanish: 'Spanish',
  fr: 'French', fra: 'French', french: 'French',
  de: 'German', deu: 'German', german: 'German',
  it: 'Italian', ita: 'Italian', italian: 'Italian',
  pt: 'Portuguese', por: 'Portuguese', portuguese: 'Portuguese',
  ru: 'Russian', rus: 'Russian', russian: 'Russian',
  zh: 'Chinese', zho: 'Chinese', chinese: 'Chinese',
  ja: 'Japanese', jpn: 'Japanese', japanese: 'Japanese',
  ko: 'Korean', kor: 'Korean', korean: 'Korean',
  pl: 'Polish', pol: 'Polish', polish: 'Polish',
  nl: 'Dutch', nld: 'Dutch', dutch: 'Dutch',
  sv: 'Swedish', swe: 'Swedish', swedish: 'Swedish',
  ar: 'Arabic', ara: 'Arabic', arabic: 'Arabic',
  hi: 'Hindi', hin: 'Hindi', hindi: 'Hindi',
  tr: 'Turkish', tur: 'Turkish', turkish: 'Turkish',
  cs: 'Czech', ces: 'Czech', czech: 'Czech',
  da: 'Danish', dan: 'Danish', danish: 'Danish',
  fi: 'Finnish', fin: 'Finnish', finnish: 'Finnish',
  no: 'Norwegian', nor: 'Norwegian', norwegian: 'Norwegian',
  uk: 'Ukrainian', ukr: 'Ukrainian', ukrainian: 'Ukrainian',
  he: 'Hebrew', heb: 'Hebrew', hebrew: 'Hebrew',
  el: 'Greek', ell: 'Greek', greek: 'Greek',
  hu: 'Hungarian', hun: 'Hungarian', hungarian: 'Hungarian',
  ro: 'Romanian', ron: 'Romanian', romanian: 'Romanian',
  th: 'Thai', tha: 'Thai', thai: 'Thai',
  vi: 'Vietnamese', vie: 'Vietnamese', vietnamese: 'Vietnamese',
  id: 'Indonesian', ind: 'Indonesian', indonesian: 'Indonesian',
  ms: 'Malay', msa: 'Malay', malay: 'Malay',
};

const SCORE_COLORS: Readonly<Record<string, string>> = {
  excellent: '#16A34A',
  good: '#22C55E',
  fair: '#F59E0B',
  poor: '#F97316',
  veryPoor: '#DC2626',
};

const STATUS_COLORS: Readonly<Record<ReadStatus, string>> = {
  [ReadStatus.UNREAD]: '#6c757d',
  [ReadStatus.READING]: '#17a2b8',
  [ReadStatus.RE_READING]: '#6f42c1',
  [ReadStatus.READ]: '#28a745',
  [ReadStatus.PARTIALLY_READ]: '#ffc107',
  [ReadStatus.PAUSED]: '#fd7e14',
  [ReadStatus.WONT_READ]: '#dc3545',
  [ReadStatus.ABANDONED]: '#e74c3c',
  [ReadStatus.UNSET]: '#343a40',
};

const STATUS_LABEL_KEYS: Readonly<Record<ReadStatus, string>> = {
  [ReadStatus.UNREAD]: 'unread',
  [ReadStatus.READING]: 'currentlyReading',
  [ReadStatus.RE_READING]: 'reReading',
  [ReadStatus.READ]: 'read',
  [ReadStatus.PARTIALLY_READ]: 'partiallyRead',
  [ReadStatus.PAUSED]: 'paused',
  [ReadStatus.WONT_READ]: 'wontRead',
  [ReadStatus.ABANDONED]: 'abandoned',
  [ReadStatus.UNSET]: 'noStatus',
};

const PROGRESS_COLORS: Readonly<Record<ReadingProgressBandId, string>> = {
  'not-started': '#6c757d',
  'just-started': '#ffc107',
  'getting-into-it': '#fd7e14',
  'halfway-through': '#17a2b8',
  'almost-finished': '#6f42c1',
  completed: '#28a745',
};

const PROGRESS_LABEL_KEYS: Readonly<Record<ReadingProgressBandId, string>> = {
  'not-started': 'notStarted',
  'just-started': 'justStarted',
  'getting-into-it': 'gettingIntoIt',
  'halfway-through': 'halfwayThrough',
  'almost-finished': 'almostFinished',
  completed: 'completed',
};

const CHART_FONT_FAMILY = "'Inter', sans-serif";

@Component({
  selector: 'app-stats-circular-distribution-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [
    BaseChartDirective,
    StatsChartCardComponent,
    StatsChartLegendComponent,
    StatsCircularChartLayoutComponent,
  ],
  template: `
    <app-stats-chart-card
      [heading]="view().heading"
      [description]="view().description"
      [showDescription]="showDescription()"
      [loadingMessage]="loadingMessage()"
      [plotHeight]="plotHeight()"
      [state]="state()"
      [emptyMessage]="view().emptyMessage">
      @if (state() === 'ready') {
        <app-stats-circular-chart-layout [plotHeight]="plotHeight()">
          <canvas
            statsCircularChartPlot
            baseChart
            [data]="chartData()"
            [options]="chartOptions()"
            [type]="view().type"></canvas>

          @if (view().averageLabel; as averageLabel) {
            <div statsCircularChartLegend class="min-w-0">
              <dl class="mb-2 min-w-0">
                <dt class="text-xs font-medium text-text-secondary">{{ averageLabel }}</dt>
                <dd class="mt-1 text-lg font-semibold tabular-nums text-text-strong">
                  {{ view().averageValue }}
                </dd>
              </dl>
              <app-stats-chart-legend [items]="view().rows" [stacked]="true" />
            </div>
          } @else {
            <app-stats-chart-legend
              statsCircularChartLegend
              [items]="view().rows"
              [stacked]="true" />
          }
        </app-stats-circular-chart-layout>
      }
    </app-stats-chart-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class StatsCircularDistributionChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly chart = input.required<StatsCircularDistribution>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly view = computed<DistributionView>(() => {
    this.activeLanguage();
    const chart = this.chart();

    switch (chart.kind) {
      case 'book-formats': return this.bookFormatsView(chart.stats);
      case 'languages': return this.languagesView(chart.stats);
      case 'metadata-score': return this.metadataScoreView(chart.stats);
      case 'read-status': return this.readStatusView(chart.stats);
      case 'reading-progress': return this.readingProgressView(chart.stats);
    }
  });

  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.view().rows.length > 0 ? 'ready' : 'empty';
  });

  readonly chartData = computed<ChartData<'pie' | 'doughnut', number[], string>>(() => {
    const view = this.view();
    if (view.rows.length === 0) return { labels: [], datasets: [] };

    return {
      labels: view.rows.map((row) => row.label),
      datasets: [{
        ...(view.datasetLabel ? { label: view.datasetLabel } : {}),
        data: view.rows.map((row) => row.count),
        backgroundColor: view.rows.map((row) => row.color),
      }],
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'pie' | 'doughnut'>['options']>(() => {
    const view = this.view();
    const label = (dataIndex: number) => view.rows.at(dataIndex)?.tooltip ?? '';

    if (this.chart().kind === 'metadata-score') {
      return {
        cutout: '60%',
        layout: { padding: { top: 10, bottom: 10 } },
        plugins: { tooltip: {
          borderColor: '#16A34A',
          borderWidth: 2,
          cornerRadius: 8,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 11 },
          callbacks: { label: (context) => label(context.dataIndex) },
        } },
      };
    }

    if (view.type === 'pie') {
      const borderColor = this.chart().kind === 'book-formats' ? '#E11D48' : '#2563EB';
      return {
        layout: { padding: { top: 10, bottom: 10 } },
        plugins: { tooltip: {
          borderColor,
          borderWidth: 2,
          cornerRadius: 8,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: { label: (context) => label(context.dataIndex) },
        } },
      };
    }

    return {
      layout: { padding: { top: 15 } },
      plugins: { tooltip: {
        titleFont: { family: CHART_FONT_FAMILY, size: 14, weight: 'bold' },
        bodyFont: { family: CHART_FONT_FAMILY, size: 13 },
        callbacks: {
          title: (context) => context[0]?.label ?? '',
          label: (context) => label(context.dataIndex),
        },
      } },
      interaction: { intersect: false, mode: 'point' },
    };
  });

  private bookFormatsView(stats: BookFormatStats): DistributionView {
    const total = stats.formats.reduce((sum, row) => sum + row.bookCount, 0);
    return {
      ...this.copy('statsLibrary.bookFormats'),
      type: 'pie',
      rows: stats.formats.map(({ format, bookCount }) => ({
        id: format,
        label: format,
        count: bookCount,
        color: FORMAT_COLORS[format] ?? '#6B7280',
        value: this.formatCount(bookCount),
        tooltip: this.translate('statsLibrary.bookFormats.tooltipLabel', {
          label: format,
          value: bookCount,
          percentage: this.percentage(bookCount, total),
        }),
      })),
    };
  }

  private languagesView(stats: LanguageStats): DistributionView {
    const total = stats.languages.reduce((sum, row) => sum + row.bookCount, 0);
    return {
      ...this.copy('statsLibrary.language'),
      type: 'pie',
      rows: stats.languages.map(({ languageId, bookCount }, index) => {
        const label = languageDisplayName(languageId);
        return {
          id: languageId,
          label,
          count: bookCount,
          color: LANGUAGE_COLORS[index % LANGUAGE_COLORS.length],
          value: this.formatCount(bookCount),
          tooltip: this.translate('statsLibrary.language.tooltipLabel', {
            label,
            value: bookCount,
            percentage: this.percentage(bookCount, total),
          }),
        };
      }),
    };
  }

  private metadataScoreView(stats: MetadataScoreStats): DistributionView {
    const buckets = stats.buckets.filter((bucket) => bucket.bookCount > 0);
    const total = buckets.reduce((sum, bucket) => sum + bucket.bookCount, 0);
    return {
      ...this.copy('statsLibrary.metadataScore'),
      type: 'doughnut',
      averageLabel: this.translate('statsLibrary.metadataScore.averageLabel'),
      averageValue: stats.averageScore == null ? '—' : `${stats.averageScore}%`,
      rows: buckets.map((bucket) => ({
        id: bucket.id,
        label: this.translate(`statsLibrary.metadataScore.${bucket.id}`),
        count: bucket.bookCount,
        color: SCORE_COLORS[bucket.id] ?? '#6B7280',
        value: this.formatCount(bucket.bookCount),
        tooltip: this.translate('statsLibrary.metadataScore.tooltipLabel', {
          value: bucket.bookCount,
          percentage: this.percentage(bucket.bookCount, total),
        }),
      })),
    };
  }

  private readStatusView(stats: ReadStatusStats): DistributionView {
    return {
      ...this.copy('statsUser.readStatus', 'statsUser.bookFlow.noData'),
      type: 'doughnut',
      rows: stats.slices.map((slice) => {
        const label = this.translate(
          `statsUser.readStatus.${STATUS_LABEL_KEYS[slice.status]}`,
        );
        return {
          id: slice.status,
          label,
          count: slice.bookCount,
          color: STATUS_COLORS[slice.status],
          value: this.formatCount(slice.bookCount),
          tooltip: this.translate('statsUser.readStatus.tooltipLabel', {
            label,
            value: slice.bookCount,
            percentage: slice.sharePercent.toFixed(1),
          }),
        };
      }),
    };
  }

  private readingProgressView(stats: ReadingProgressStats): DistributionView {
    return {
      ...this.copy('statsUser.readingProgress', 'statsUser.bookFlow.noData'),
      type: 'doughnut',
      datasetLabel: this.translate('statsUser.readingProgress.booksByProgress'),
      rows: stats.totalBooks === 0 ? [] : stats.bands.map((band) => ({
        id: band.id,
        label: band.label,
        count: band.bookCount,
        color: PROGRESS_COLORS[band.id],
        value: this.formatCount(band.bookCount),
        tooltip: this.translate('statsUser.readingProgress.tooltipLabel', {
          value: band.bookCount,
          plural: band.bookCount === 1 ? '' : 's',
          description: this.translate(
            `statsUser.readingProgress.${PROGRESS_LABEL_KEYS[band.id]}`,
          ),
          percentage: this.percentage(band.bookCount, stats.totalBooks),
        }),
      })),
    };
  }

  private copy(prefix: string, emptyKey = `${prefix}.noData`) {
    return {
      heading: this.translate(`${prefix}.title`),
      description: this.translate(`${prefix}.description`),
      emptyMessage: this.translate(emptyKey),
    };
  }

  private translate(key: string, params?: Record<string, number | string>): string {
    return this.transloco.translate(key, params);
  }

  private formatCount(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }

  private percentage(value: number, total: number): string {
    return ((value / total) * 100).toFixed(1);
  }
}

function languageDisplayName(language: string): string {
  const lower = language.toLowerCase();
  return LANGUAGE_NAMES[lower] ?? language.charAt(0).toUpperCase() + language.slice(1);
}
