import { type ReadingHeatmapStats } from '../../../../data/user/reading-heatmap-stats';
import {
  type StatsHeatmapPresentation,
  type StatsPresenterTranslate,
} from './stats-heatmap-family.types';

export function presentReadingMonths(
  stats: ReadingHeatmapStats,
  locale: string,
  translate: StatsPresenterTranslate,
): StatsHeatmapPresentation {
  const months = Array.from({ length: 12 }, (_, month) =>
    new Date(2000, month, 1).toLocaleDateString(locale, { month: 'short' }),
  );
  return {
    kind: 'reading-months',
    heading: translate('statsUser.readingHeatmap.title'),
    description: translate('statsUser.readingHeatmap.description'),
    hasData: stats.totalBooks > 0,
    seriesLabel: translate('statsUser.readingHeatmap.booksRead'),
    maximumValue: stats.maximumBookCount,
    cells: stats.cells.map((cell) => ({
      x: cell.monthIndex,
      y: cell.yearIndex,
      v: cell.bookCount,
      tooltipLabel: translate(
        cell.bookCount === 1
          ? 'statsUser.readingHeatmap.tooltipBook'
          : 'statsUser.readingHeatmap.tooltipBooks',
        { value: cell.bookCount },
      ),
    })),
    monthLabels: months,
    axisLabels: stats.years,
    summary: [],
    milestones: [],
    milestonesLabel: '',
  };
}
