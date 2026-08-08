import { type StatsChartSummaryItem } from '../../../shared/stats-chart-summary.component';
import { type ReadingHeatmapStats } from '../../../../data/user/reading-heatmap-stats';
import {
  type ReadingMilestoneId,
  type ReadingStreaks,
  type SessionHeatmapCalendar,
} from '../../../../data/user/reading-session-heatmap-stats';
import { type StatsPresenterTranslate } from '../point-family/stats-point-family.types';

export type StatsHeatmapFamilyChart =
  | { readonly kind: 'reading-months'; readonly stats: ReadingHeatmapStats }
  | {
      readonly kind: 'session-calendar';
      readonly stats: { readonly calendar: SessionHeatmapCalendar; readonly streaks: ReadingStreaks };
      readonly year: number;
      readonly yearOptions: readonly number[];
    };

export interface StatsHeatmapDatum {
  readonly x: number;
  readonly y: number;
  readonly v: number;
  readonly tooltipLabel: string;
  readonly date?: string;
}

export interface StatsHeatmapMilestone {
  readonly id: ReadingMilestoneId;
  readonly label: string;
  readonly icon: string;
  readonly unlocked: boolean;
}

export interface StatsHeatmapPresentation {
  readonly kind: StatsHeatmapFamilyChart['kind'];
  readonly heading: string;
  readonly description: string;
  readonly hasData: boolean;
  readonly seriesLabel: string;
  readonly maximumValue: number;
  readonly cells: readonly StatsHeatmapDatum[];
  readonly monthLabels: readonly string[];
  readonly axisLabels: readonly (string | number)[];
  readonly summary: readonly StatsChartSummaryItem[];
  readonly milestones: readonly StatsHeatmapMilestone[];
  readonly milestonesLabel: string;
}

export type { StatsPresenterTranslate };
