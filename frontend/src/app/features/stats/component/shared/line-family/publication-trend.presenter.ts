import { type PublicationTrendStats } from '../../../data/library/publication-trend-stats';
import { type LineChartView, type LinePresenterContext } from './stats-line-family-chart.types';

const PREFIX = 'statsLibrary.publicationTrend';
const CYAN = '#06b6d4';

export function buildPublicationTrendView(
  stats: PublicationTrendStats,
  { translate }: LinePresenterContext,
): LineChartView {
  const t = (key: string, params?: Record<string, unknown>) =>
    translate(`${PREFIX}.${key}`, params);
  const insights = stats.insights;
  const summary = insights
    ? [
        { label: t('insightPeakYear'), value: insights.peakYear?.year ?? 0, detail: t('insightPeakYearBooks', { count: insights.peakYear?.bookCount ?? 0 }) },
        { label: t('insightLast10Years'), value: `${insights.recentPercent}%`, detail: t('insightLast10YearsBooks', { count: insights.recentBookCount }) },
        { label: t('insightAvgPerYear'), value: insights.averageBooksPerActiveYear, detail: t('insightBooksPerYear') },
        { label: t('insightBest5YearSpan'), value: insights.busiestSpan ? `${insights.busiestSpan.startYear}-${insights.busiestSpan.endYear}` : 'N/A', detail: t('insightMostBooksPublished') },
        { label: t('insightTimeSpan'), value: insights.yearSpan, detail: t('insightYearsCovered') },
        { label: t('insightCentury21'), value: `${insights.modernPercent}%`, detail: t('insightCentury21Books', { count: insights.modernBookCount }) },
        { label: t('insightClassics'), value: `${insights.classicPercent}%`, detail: t('insightClassicsPre1970', { count: insights.classicBookCount }) },
        { label: t('insightUniqueYears'), value: insights.activeYearCount, detail: `${decade(stats.firstYear)} - ${decade(stats.lastYear)}` },
      ]
    : [];

  return {
    heading: t('title'),
    description: t('description'),
    emptyMessage: t('noData'),
    hasData: stats.totalBooks > 0,
    labels: stats.years.map(({ year }) => year.toString()),
    series: stats.years.length === 0 ? [] : [{
      id: 'books', label: t('axisBooks'), color: CYAN, fillColor: 'rgba(6, 182, 212, 0.1)', fill: true,
      tension: 0.3, borderWidth: 3, pointRadius: 4, pointHoverRadius: 7, pointBorderWidth: 2,
      points: stats.years.map(({ year, bookCount }) => ({
        value: bookCount,
        tooltipTitle: t('tooltipTitle', { year: year.toString() }),
        tooltipLines: [t(bookCount === 1 ? 'tooltipBook' : 'tooltipBooks', { value: bookCount })],
      })),
    }],
    xAxis: { title: t('axisPublicationYear'), titleSize: 12, titleWeight: 500, tickSize: 10, rotation: 45, maxTicks: 20 },
    yAxes: [{ title: t('axisBooks'), beginAtZero: true, titleSize: 12, titleWeight: 500, tickSize: 11, precision: 0, stepSize: 1 }],
    legendAside: stats.firstYear == null ? '' : `${stats.firstYear} - ${stats.lastYear}`,
    summary,
    tooltipAccent: CYAN,
    tooltipBorderWidth: 2,
    tooltipCornerRadius: 8,
    tooltipTitleSize: 13,
    tooltipBodySize: 11,
    layout: 'library',
    interaction: 'index',
  };
}

function decade(year: number | null): string {
  if (year == null) return '';
  return year < 1900 ? 'Pre-1900' : `${Math.floor(year / 10) * 10}s`;
}
