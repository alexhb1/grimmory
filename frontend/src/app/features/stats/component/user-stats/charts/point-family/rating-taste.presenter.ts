import {
  type RatingTasteQuadrantId,
  type RatingTasteStats,
} from '../../../../data/user/rating-taste-stats';
import {
  type StatsPointFamilyPresentation,
  type StatsPresenterTranslate,
} from './stats-point-family.types';

const COLORS: Readonly<Record<RatingTasteQuadrantId, { fill: string; border: string }>> = {
  'hidden-gems': { fill: 'rgba(156, 39, 176, 0.7)', border: '#9c27b0' },
  'popular-favorites': { fill: 'rgba(76, 175, 80, 0.7)', border: '#4caf50' },
  overrated: { fill: 'rgba(255, 152, 0, 0.7)', border: '#ff9800' },
  'agreed-misses': { fill: 'rgba(158, 158, 158, 0.7)', border: '#9e9e9e' },
};
const LABEL_KEYS: Readonly<Record<RatingTasteQuadrantId, string>> = {
  'hidden-gems': 'quadrantHiddenGems',
  'popular-favorites': 'quadrantPopularFavorites',
  overrated: 'quadrantOverrated',
  'agreed-misses': 'quadrantAgreedMisses',
};

export function presentRatingTaste(
  stats: RatingTasteStats,
  locale: string,
  translate: StatsPresenterTranslate,
): StatsPointFamilyPresentation {
  const label = (id: RatingTasteQuadrantId) =>
    translate(`statsUser.ratingTaste.${LABEL_KEYS[id]}`);
  const count = (value: number) => value.toLocaleString(locale);
  const quadrants = stats.quadrants.map((quadrant) => ({ ...quadrant, label: label(quadrant.id) }));
  const deviation = stats.averageDeviation > 1
    ? translate('statsUser.ratingTaste.uniqueTaste')
    : stats.averageDeviation <= 0.5
      ? translate('statsUser.ratingTaste.mainstream')
      : translate('statsUser.ratingTaste.balanced');

  return {
    kind: 'rating-taste',
    heading: translate('statsUser.ratingTaste.title'),
    description: translate('statsUser.ratingTaste.description'),
    emptyMessage: translate('statsUser.bookFlow.noData'),
    hasData: stats.totalRatedBooks > 0,
    xAxisLabel: translate('statsUser.ratingTaste.axisExternalRating'),
    yAxisLabel: translate('statsUser.ratingTaste.axisPersonalRating'),
    series: quadrants.filter((quadrant) => quadrant.bookCount > 0).map((quadrant) => ({
      label: quadrant.label,
      fillColor: COLORS[quadrant.id].fill,
      borderColor: COLORS[quadrant.id].border,
      points: stats.books.filter((book) => book.quadrant === quadrant.id).map((book) => {
        const difference = book.normalizedRating - book.externalRating;
        return {
          x: book.externalRating,
          y: book.normalizedRating,
          tooltipTitle: book.title || translate('statsUser.ratingTaste.tooltipUnknownBook'),
          tooltipLines: [
            translate('statsUser.ratingTaste.tooltipYourRating', {
              rating: book.personalRating, normalized: book.normalizedRating.toFixed(1),
            }),
            translate('statsUser.ratingTaste.tooltipExternalRating', {
              rating: book.externalRating.toFixed(1),
            }),
            translate('statsUser.ratingTaste.tooltipDifference', {
              diff: difference > 0 ? `+${difference.toFixed(1)}` : difference.toFixed(1),
            }),
            translate('statsUser.ratingTaste.tooltipCategory', { category: quadrant.label }),
          ],
        };
      }),
    })),
    legend: quadrants.map((quadrant) => ({ label: quadrant.label, color: COLORS[quadrant.id].border })),
    summary: [
      { label: translate('statsUser.ratingTaste.booksAnalyzed'), value: count(stats.totalRatedBooks) },
      {
        label: translate('statsUser.ratingTaste.avgDeviation'),
        value: stats.averageDeviation.toLocaleString(locale, {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        }),
        detail: deviation,
      },
      ...quadrants.map((quadrant) => ({
        label: quadrant.label, value: count(quadrant.bookCount), detail: `${quadrant.sharePercent}%`,
      })),
    ],
  };
}
