import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatsChartJsHostDirective } from '../../../shared/stats-chart-js-host.directive';

import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type ChartConfiguration, type ChartData, type ScatterDataPoint } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import {
  type RatingTasteQuadrantId,
  type RatingTasteStats,
} from '../../../../data/user/rating-taste-stats';

interface RatingTasteDatum extends ScatterDataPoint {
  readonly title: string;
  readonly personalRating: number;
  readonly normalizedRating: number;
  readonly externalRating: number;
  readonly quadrant: RatingTasteQuadrantId;
}

interface RatingTasteQuadrantView {
  readonly id: RatingTasteQuadrantId;
  readonly label: string;
  readonly color: string;
  readonly bookCount: number;
  readonly sharePercent: number;
}

type RatingTasteChartData = ChartData<'scatter', RatingTasteDatum[], string>;
type RatingTasteQuadrant = RatingTasteStats['quadrants'][number];

const CHART_FONT_FAMILY = "'Inter', sans-serif";

const QUADRANT_COLORS: Readonly<Record<RatingTasteQuadrantId, { fill: string; border: string }>> = {
  'hidden-gems': { fill: 'rgba(156, 39, 176, 0.7)', border: '#9c27b0' },
  'popular-favorites': { fill: 'rgba(76, 175, 80, 0.7)', border: '#4caf50' },
  overrated: { fill: 'rgba(255, 152, 0, 0.7)', border: '#ff9800' },
  'agreed-misses': { fill: 'rgba(158, 158, 158, 0.7)', border: '#9e9e9e' },
};

const QUADRANT_LABEL_KEYS: Readonly<Record<RatingTasteQuadrantId, string>> = {
  'hidden-gems': 'quadrantHiddenGems',
  'popular-favorites': 'quadrantPopularFavorites',
  overrated: 'quadrantOverrated',
  'agreed-misses': 'quadrantAgreedMisses',
};

@Component({
  selector: 'app-rating-taste-chart',
  standalone: true,
  hostDirectives: [StatsChartJsHostDirective],
  imports: [BaseChartDirective, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './rating-taste-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class RatingTasteChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<RatingTasteStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly chartType = 'scatter' as const;
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalRatedBooks > 0 ? 'ready' : 'empty';
  });
  readonly emptyMessage = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.bookFlow.noData');
  });
  readonly quadrants = computed<readonly RatingTasteQuadrantView[]>(() =>
    this.stats().quadrants.map((quadrant) => this.toQuadrantView(quadrant)),
  );
  readonly deviationDescription = computed(() => {
    this.activeLanguage();
    const deviation = this.stats().averageDeviation;
    if (deviation > 1) return this.transloco.translate('statsUser.ratingTaste.uniqueTaste');
    if (deviation <= 0.5) return this.transloco.translate('statsUser.ratingTaste.mainstream');
    return this.transloco.translate('statsUser.ratingTaste.balanced');
  });

  readonly chartData = computed<RatingTasteChartData>(() => {
    const books = this.stats().books;

    return {
      datasets: this.stats()
        .quadrants.filter((quadrant) => quadrant.bookCount > 0)
        .map((quadrant) => ({
          label: this.quadrantLabel(quadrant.id),
          data: books
            .filter((book) => book.quadrant === quadrant.id)
            .map<RatingTasteDatum>((book) => ({
              x: book.externalRating,
              y: book.normalizedRating,
              title: book.title,
              personalRating: book.personalRating,
              normalizedRating: book.normalizedRating,
              externalRating: book.externalRating,
              quadrant: book.quadrant,
            })),
          backgroundColor: QUADRANT_COLORS[quadrant.id].fill,
          borderColor: QUADRANT_COLORS[quadrant.id].border,
          pointRadius: 6,
          pointHoverRadius: 9,
          pointBorderWidth: 2,
        })),
    };
  });

  readonly chartOptions = computed<ChartConfiguration<'scatter'>['options']>(() => {
    this.activeLanguage();

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20, right: 20, bottom: 10, left: 10 } },
      scales: {
        x: {
          min: 0,
          max: 5,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.ratingTaste.axisExternalRating'),
            font: { family: CHART_FONT_FAMILY, size: 12, weight: 500 },
          },
          ticks: { stepSize: 1, font: { family: CHART_FONT_FAMILY, size: 11 } },
          grid: { drawTicks: true },
        },
        y: {
          min: 0,
          max: 5,
          title: {
            display: true,
            text: this.transloco.translate('statsUser.ratingTaste.axisPersonalRating'),
            font: { family: CHART_FONT_FAMILY, size: 12, weight: 500 },
          },
          ticks: { stepSize: 1, font: { family: CHART_FONT_FAMILY, size: 11 } },
          grid: { drawTicks: true },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          borderColor: '#9c27b0',
          borderWidth: 2,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: CHART_FONT_FAMILY, size: 13, weight: 'bold' },
          bodyFont: { family: CHART_FONT_FAMILY, size: 11 },
          callbacks: {
            title: (context) => {
              const datum = context[0].raw as RatingTasteDatum;
              return (
                datum.title || this.transloco.translate('statsUser.ratingTaste.tooltipUnknownBook')
              );
            },
            label: (context) => {
              const datum = context.raw as RatingTasteDatum;
              const difference = datum.normalizedRating - datum.externalRating;

              return [
                this.transloco.translate('statsUser.ratingTaste.tooltipYourRating', {
                  rating: datum.personalRating,
                  normalized: datum.normalizedRating.toFixed(1),
                }),
                this.transloco.translate('statsUser.ratingTaste.tooltipExternalRating', {
                  rating: datum.externalRating.toFixed(1),
                }),
                this.transloco.translate('statsUser.ratingTaste.tooltipDifference', {
                  diff: difference > 0 ? `+${difference.toFixed(1)}` : difference.toFixed(1),
                }),
                this.transloco.translate('statsUser.ratingTaste.tooltipCategory', {
                  category: this.quadrantLabel(datum.quadrant),
                }),
              ];
            },
          },
        },
      },
      elements: { point: { radius: 6, hoverRadius: 9, borderWidth: 2 } },
    };
  });

  protected formatCount(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }

  protected formatDeviation(value: number): string {
    return value.toLocaleString(this.activeLanguage(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private toQuadrantView(quadrant: RatingTasteQuadrant): RatingTasteQuadrantView {
    return {
      id: quadrant.id,
      label: this.quadrantLabel(quadrant.id),
      color: QUADRANT_COLORS[quadrant.id].border,
      bookCount: quadrant.bookCount,
      sharePercent: quadrant.sharePercent,
    };
  }

  private quadrantLabel(id: RatingTasteQuadrantId): string {
    this.activeLanguage();
    return this.transloco.translate(`statsUser.ratingTaste.${QUADRANT_LABEL_KEYS[id]}`);
  }
}
