import { type ReadingJourneyStats } from '../../../data/library/reading-journey-stats';
import { type LineChartView, type LinePresenterContext, type LineSeries } from './stats-line-family-chart.types';

const PREFIX = 'statsLibrary.readingJourney.';

export function buildReadingJourneyView(
  stats: ReadingJourneyStats,
  context: LinePresenterContext,
): LineChartView {
  const t = (key: string, params?: Record<string, unknown>) => context.translate(PREFIX + key, params);
  const number = (value: number) => value.toLocaleString(context.locale);
  const formatMonth = (value: string) => {
    const [year, monthNumber] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(context.locale, {
      month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  };
  const monthLabel = (value: string) => {
    const [year, monthNumber] = value.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[Number(monthNumber) - 1]} ${year}`;
  };
  const labels = stats.months.map((item) => monthLabel(item.month));
  const series = (id: 'added' | 'finished', added: boolean): LineSeries => {
    const label = t(added ? 'legendBooksAdded' : 'legendBooksFinished');
    return {
      id,
      label,
      color: added ? '#3b82f6' : '#10b981',
      fillColor: added ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.2)',
      fill: true,
      order: added ? 2 : 1,
      tension: 0.3,
      borderWidth: 3,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBorderWidth: 2,
      points: stats.months.map((item) => {
        const value = added ? item.cumulativeAdded : item.cumulativeFinished;
        return {
          value,
          tooltipLines: [`${label}: ${number(value)}`],
          tooltipAfterBody: [`\n${t('tooltipBacklog', { count: item.backlog })}`],
        };
      }),
    };
  };
  const insights = stats.insights;

  return {
    heading: t('title'),
    description: t('description'),
    emptyMessage: `${t('noData')} ${t('noDataHint')}`,
    hasData: stats.months.length > 0,
    labels,
    series: [series('added', true), series('finished', false)],
    xAxis: { title: t('axisMonth'), titleSize: 12, titleWeight: 500, tickSize: 10, rotation: 45, maxTicks: 24 },
    yAxes: [{ title: t('axisCumulativeBooks'), titleSize: 12, titleWeight: 500, tickSize: 11, beginAtZero: true, precision: 0 }],
    legend: [
      { id: 'added', label: t('legendBooksAdded'), color: '#3b82f6' },
      { id: 'finished', label: t('legendBooksFinished'), color: '#10b981' },
    ],
    legendAside: labels.length > 0 ? `${labels[0]} - ${labels.at(-1)}` : '',
    legendPosition: 'before',
    summary: !insights ? [] : [
      { label: t('insightCurrentBacklog'), value: number(insights.currentBacklog), detail: t('insightBacklogPercent', { percent: insights.backlogPercent }) },
      { label: t('insightAvgTimeToFinish'), value: insights.averageDaysToFinish === null ? '—' : number(insights.averageDaysToFinish), detail: t('insightDaysAfterAdding') },
      { label: t('insightBestReadingMonth'), value: number(insights.bestReadingMonth?.count ?? 0), detail: insights.bestReadingMonth ? formatMonth(insights.bestReadingMonth.month) : '—', truncateDetail: true },
      { label: t('insightPeakAcquisition'), value: number(insights.peakAcquisitionMonth?.count ?? 0), detail: insights.peakAcquisitionMonth ? formatMonth(insights.peakAcquisitionMonth.month) : '—', truncateDetail: true },
      { label: t('insightFinishRate'), value: number(insights.finishRate), detail: t('insightBooksPerMonthAvg') },
      { label: t('insightLongestStreak'), value: number(insights.longestReadingStreak), detail: t('insightConsecutiveMonths') },
      { label: t('insightLast3Months'), value: number(insights.recentFinishedCount), detail: t('insightRecentlyFinished') },
      { label: t('insightCompletion'), value: `${number(insights.totalFinished)}/${number(insights.totalAdded)}`, detail: t('insightBooksFinished') },
    ],
    summaryContainerColumns: true,
    tooltipAccent: '#10b981',
    tooltipBorderWidth: 2,
    tooltipCornerRadius: 8,
    tooltipTitleSize: 13,
    tooltipBodySize: 11,
    layout: 'library',
    interaction: 'index',
  };
}
