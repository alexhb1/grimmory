import {
  type BookLengthStats,
  type BookLengthStatusGroup,
} from '../../../../data/user/book-length-stats';
import {
  type StatsPointFamilyPresentation,
  type StatsPresenterTranslate,
} from './stats-point-family.types';

const COLORS: Readonly<Record<BookLengthStatusGroup, { fill: string; border: string }>> = {
  read: { fill: 'rgba(76, 175, 80, 0.7)', border: '#4caf50' },
  reading: { fill: 'rgba(33, 150, 243, 0.7)', border: '#2196f3' },
  abandoned: { fill: 'rgba(244, 67, 54, 0.7)', border: '#f44336' },
  other: { fill: 'rgba(158, 158, 158, 0.7)', border: '#9e9e9e' },
};
const LABEL_KEYS: Readonly<Record<BookLengthStatusGroup, string>> = {
  read: 'statusRead', reading: 'statusReading', abandoned: 'statusAbandoned', other: 'statusOther',
};

export function presentBookLength(
  stats: BookLengthStats,
  locale: string,
  translate: StatsPresenterTranslate,
): StatsPointFamilyPresentation {
  const label = (group: BookLengthStatusGroup) =>
    translate(`statsUser.bookLength.${LABEL_KEYS[group]}`);
  const count = (value: number) => value.toLocaleString(locale);
  const rating = (value: number) => value.toLocaleString(locale, {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  });

  return {
    kind: 'book-length',
    heading: translate('statsUser.bookLength.title'),
    description: translate('statsUser.bookLength.description'),
    emptyMessage: translate('statsUser.bookFlow.noData'),
    hasData: stats.totalRatedBooks > 0,
    xAxisLabel: translate('statsUser.bookLength.axisPageCount'),
    yAxisLabel: translate('statsUser.bookLength.axisPersonalRating'),
    series: stats.groups.map((group) => ({
      label: label(group),
      fillColor: COLORS[group].fill,
      borderColor: COLORS[group].border,
      points: stats.points.filter((point) => point.group === group).map((point) => ({
        x: point.pageCount,
        y: point.personalRating,
        tooltipTitle: point.title || translate('statsUser.bookLength.tooltipUnknownBook'),
        tooltipLines: [
          translate('statsUser.bookLength.tooltipPages', { count: point.pageCount }),
          translate('statsUser.bookLength.tooltipRating', { rating: point.personalRating }),
          translate('statsUser.bookLength.tooltipStatus', { status: label(group) }),
        ],
      })),
    })),
    legend: stats.groups.map((group) => ({
      label: label(group), color: COLORS[group].border,
      value: count(stats.points.filter((point) => point.group === group).length),
    })),
    summary: [
      { label: translate('statsUser.bookLength.booksAnalyzed'), value: count(stats.totalRatedBooks) },
      {
        label: translate('statsUser.bookLength.sweetSpot'),
        value: stats.sweetSpot?.label ?? '—',
        detail: stats.sweetSpot
          ? `${translate('statsUser.bookLength.tooltipRating', { rating: rating(stats.sweetSpot.averageRating) })} · ${translate('statsUser.bookLength.sweetSpotBookCount', { count: count(stats.sweetSpot.bookCount) })}`
          : undefined,
      },
      {
        label: translate('statsUser.bookLength.trend'),
        value: stats.trend ? formatTrend(stats.trend.ratingChangePerDoubling, locale) : '—',
        detail: stats.trend ? translate('statsUser.bookLength.trendDescription') : undefined,
      },
    ],
  };
}

function formatTrend(value: number, locale: string): string {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${Math.abs(rounded).toLocaleString(locale, {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  })}`;
}
