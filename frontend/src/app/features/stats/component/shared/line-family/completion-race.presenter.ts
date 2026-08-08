import { type CompletionRaceStats } from '../../../data/user/completion-race-stats';
import { type LineChartView, type LinePresenterContext } from './stats-line-family-chart.types';

const LINE_COLORS = [
  '#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0',
  '#00bcd4', '#ff5722', '#8bc34a', '#3f51b5', '#ffc107',
  '#795548', '#607d8b', '#f44336', '#009688', '#cddc39',
] as const;

const LABEL_LIMIT = 30;

export function buildCompletionRaceView(
  stats: CompletionRaceStats,
  year: number,
  context: LinePresenterContext,
): LineChartView {
  const { translate } = context;
  const books = stats.books.map((book, index) => {
    const label = truncate(book.bookTitle, LABEL_LIMIT);
    const color = LINE_COLORS[index % LINE_COLORS.length];
    return { book, label, color };
  });

  return {
    heading: translate('statsUser.completionRace.title'),
    description: translate('statsUser.completionRace.description'),
    emptyMessage: `${translate('statsUser.completionRace.noData', { year })} ${translate('statsUser.completionRace.noDataHint')}`,
    hasData: stats.totalBooks > 0,
    sectionedHeader: true,
    series: books.map(({ book, label, color }) => ({
      id: String(book.bookId),
      label,
      color,
      fill: false,
      tension: 0.3,
      stepped: 'before',
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
      points: book.points.map((point) => ({
        x: point.dayNumber,
        value: point.progress,
        tooltipTitle: label,
        tooltipLines: [translate('statsUser.completionRace.tooltipDayProgress', {
          day: point.dayNumber,
          progress: point.progress.toFixed(1),
        })],
      })),
    })),
    xAxis: {
      title: translate('statsUser.completionRace.axisDaysSinceFirstSession'),
      type: 'linear',
      titleSize: 12,
      titleWeight: 'bold',
      tickSize: 11,
      stepSize: 1,
    },
    yAxes: [{
      title: translate('statsUser.completionRace.axisProgress'),
      minimum: 0,
      maximum: 100,
      titleSize: 12,
      titleWeight: 'bold',
      tickSize: 11,
      tickFormat: 'percent',
    }],
    legend: books.map(({ book, label, color }) => ({ id: book.bookId, label, color })),
    summary: [
      { label: translate('statsUser.completionRace.books'), value: stats.totalBooks },
      { label: translate('statsUser.completionRace.sessions'), value: stats.totalSessions },
      { label: translate('statsUser.completionRace.avgDays'), value: stats.averageDays },
      { label: translate('statsUser.completionRace.medianDays'), value: stats.medianDays },
      ...(stats.fastest ? [{ label: translate('statsUser.completionRace.fastest'), value: stats.fastest.totalDays,
        detail: stats.fastest.bookTitle, detailTitle: stats.fastest.bookTitle, truncateDetail: true }] : []),
      ...(stats.slowest ? [{ label: translate('statsUser.completionRace.slowest'), value: stats.slowest.totalDays,
        detail: stats.slowest.bookTitle, detailTitle: stats.slowest.bookTitle, truncateDetail: true }] : []),
    ],
    tooltipTitleSize: 13,
    tooltipBodySize: 11,
    interaction: 'nearest',
    layout: 'standard',
  };
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength)}…` : value;
}
