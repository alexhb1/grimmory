import { type CompletionRaceStats } from '../../../data/user/completion-race-stats';
import { type PeakHoursStats } from '../../../data/user/peak-hours-stats';
import { type PublicationEraStats } from '../../../data/user/publication-era-stats';
import { type ReadingSurvivalStats } from '../../../data/user/reading-survival-stats';
import { type PublicationTrendStats } from '../../../data/library/publication-trend-stats';
import { type ReadingJourneyStats } from '../../../data/library/reading-journey-stats';
import { type StatsChartSummaryItem } from '../stats-chart-summary.component';

export type StatsLineFamilyChart =
  | { readonly kind: 'publication-trend'; readonly stats: PublicationTrendStats }
  | { readonly kind: 'reading-journey'; readonly stats: ReadingJourneyStats }
  | {
      readonly kind: 'peak-hours';
      readonly stats: PeakHoursStats;
      readonly year: number | null;
      readonly month: number | null;
      readonly yearOptions: readonly number[];
    }
  | { readonly kind: 'publication-era'; readonly stats: PublicationEraStats }
  | {
      readonly kind: 'completion-race';
      readonly stats: CompletionRaceStats;
      readonly year: number;
      readonly yearOptions: readonly number[];
    }
  | { readonly kind: 'reading-survival'; readonly stats: ReadingSurvivalStats };

export interface LinePresenterContext {
  readonly locale: string;
  readonly translate: (key: string, params?: Record<string, unknown>) => string;
}

export interface LinePoint {
  readonly value: number;
  readonly x?: number;
  readonly tooltipTitle?: string;
  readonly tooltipLines: readonly string[];
  readonly tooltipAfterBody?: readonly string[];
}

export interface LineSeries {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly fillColor?: string;
  readonly points: readonly LinePoint[];
  readonly axis?: 'y' | 'y1';
  readonly fill?: boolean;
  readonly order?: number;
  readonly stepped?: true | 'before';
  readonly tension?: number;
  readonly borderWidth?: number;
  readonly pointRadius?: number;
  readonly pointHoverRadius?: number;
  readonly pointBorderWidth?: number;
}

export interface LineAxis {
  readonly title: string;
  readonly type?: 'category' | 'linear';
  readonly position?: 'left' | 'right';
  readonly beginAtZero?: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly titleColor?: string;
  readonly titleSize: number;
  readonly titleWeight?: 500 | 'bold';
  readonly tickSize: number;
  readonly tickFormat?: 'percent' | 'minutes';
  readonly stepSize?: number;
  readonly precision?: number;
  readonly rotation?: number;
  readonly maxTicks?: number;
  readonly autoSkipPadding?: number;
  readonly drawOnChartArea?: boolean;
  readonly showBorder?: boolean;
}

export interface LineLegendItem {
  readonly id: string | number;
  readonly label: string;
  readonly color: string;
}

export interface LineChartView {
  readonly heading: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly hasData: boolean;
  readonly sectionedHeader?: boolean;
  readonly labels?: readonly string[];
  readonly series: readonly LineSeries[];
  readonly xAxis: LineAxis;
  readonly yAxes: readonly [LineAxis, ...LineAxis[]];
  readonly legend?: readonly LineLegendItem[];
  readonly legendAside?: string;
  readonly legendPosition?: 'before' | 'after';
  readonly summary?: readonly StatsChartSummaryItem[];
  readonly summaryContainerColumns?: boolean;
  readonly tooltipAccent?: string;
  readonly tooltipBorderWidth?: number;
  readonly tooltipCornerRadius?: number;
  readonly tooltipPadding?: number;
  readonly tooltipTitleSize?: number;
  readonly tooltipBodySize?: number;
  readonly layout?: 'library' | 'top-right' | 'standard';
  readonly interaction?: 'index' | 'nearest';
  readonly animationDuration?: number;
}
