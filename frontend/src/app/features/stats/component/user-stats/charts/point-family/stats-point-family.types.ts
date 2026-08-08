import { type StatsChartLegendItem } from '../../../shared/stats-chart-legend.component';
import { type StatsChartSummaryItem } from '../../../shared/stats-chart-summary.component';
import { type BookLengthStats } from '../../../../data/user/book-length-stats';
import { type RatingTasteStats } from '../../../../data/user/rating-taste-stats';
import { type SessionArchetypeStats } from '../../../../data/user/session-archetypes-stats';

export type StatsPointFamilyChart =
  | { readonly kind: 'book-length'; readonly stats: BookLengthStats }
  | { readonly kind: 'rating-taste'; readonly stats: RatingTasteStats }
  | {
      readonly kind: 'session-archetypes';
      readonly stats: SessionArchetypeStats;
      readonly year: number;
      readonly yearOptions: readonly number[];
    };

export interface StatsPointFamilyDatum {
  readonly x: number;
  readonly y: number;
  readonly tooltipTitle?: string;
  readonly tooltipLines?: readonly string[];
}

export interface StatsPointFamilySeries {
  readonly label: string;
  readonly fillColor: string;
  readonly borderColor: string;
  readonly points: readonly StatsPointFamilyDatum[];
}

export interface StatsPointFamilyPresentation {
  readonly kind: StatsPointFamilyChart['kind'];
  readonly heading: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly hasData: boolean;
  readonly xAxisLabel: string;
  readonly yAxisLabel: string;
  readonly series: readonly StatsPointFamilySeries[];
  readonly legend: readonly StatsChartLegendItem[];
  readonly summary: readonly StatsChartSummaryItem[];
}

export type StatsPresenterTranslate = (
  key: string,
  params?: Record<string, unknown>,
) => string;
