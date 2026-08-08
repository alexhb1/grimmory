import { type PublicationEraStats } from '../../../data/user/publication-era-stats';
import { type LineChartView, type LinePresenterContext } from './stats-line-family-chart.types';

const COLORS = [
  '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
  '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#ff9800',
] as const;

export function buildPublicationEraView(
  stats: PublicationEraStats,
  context: LinePresenterContext,
): LineChartView {
  const { locale, translate } = context;
  const count = (value: number) => value.toLocaleString(locale);
  const rating = (value: number) => value.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const summary = stats.bestDecade
    ? [
        { label: translate('statsUser.publicationEra.bestDecade'), value: stats.bestDecade.label },
        {
          label: translate('statsUser.publicationEra.avgRating'),
          value: `${rating(stats.bestDecade.averageRating)}/10`,
        },
        { label: translate('statsUser.publicationEra.booksRated'), value: count(stats.ratedBookCount) },
      ]
    : [{ label: translate('statsUser.publicationEra.booksRated'), value: count(stats.ratedBookCount) }];

  return {
    heading: translate('statsUser.publicationEra.title'),
    description: translate('statsUser.publicationEra.description'),
    emptyMessage: `${translate('statsUser.publicationEra.noData')} ${translate('statsUser.publicationEra.noDataHint')}`,
    hasData: stats.decades.length > 0,
    labels: stats.ratingBucketLabels,
    series: stats.decades.map((decade, index) => {
      const color = COLORS[index % COLORS.length];
      return {
        id: decade.label,
        label: decade.label,
        color,
        fillColor: `${color}20`,
        points: decade.bucketCounts.map((value) => ({
          value,
          tooltipLines: [`${decade.label}: ${translate(
            value === 1 ? 'statsUser.personalRating.tooltipBook' : 'statsUser.personalRating.tooltipBooks',
            { value: count(value) },
          )}`],
        })),
        borderWidth: 2.5,
        pointRadius: 5,
        pointBorderWidth: 1.5,
        tension: 0.3,
        fill: false,
      };
    }),
    xAxis: {
      title: translate('statsUser.personalRating.axisPersonalRating'), titleSize: 11, tickSize: 11,
      showBorder: true,
    },
    yAxes: [{
      title: translate('statsUser.personalRating.axisNumberOfBooks'), titleSize: 11, tickSize: 11,
      beginAtZero: true, stepSize: 1, showBorder: true,
    }],
    legend: stats.decades.map((decade, index) => ({
      id: decade.label, label: decade.label, color: COLORS[index % COLORS.length],
    })),
    summary,
    layout: 'top-right',
    interaction: 'index',
    tooltipPadding: 10,
    animationDuration: 400,
  };
}
