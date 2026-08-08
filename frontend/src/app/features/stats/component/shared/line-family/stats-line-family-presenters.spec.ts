import { describe, expect, it } from 'vitest';

import { calculatePublicationTrendStats } from '../../../data/library/publication-trend-stats';
import { calculateReadingJourneyStats } from '../../../data/library/reading-journey-stats';
import { mapCompletionRaceStats } from '../../../data/user/completion-race-stats';
import { mapPeakHours } from '../../../data/user/peak-hours-stats';
import { calculatePublicationEraStats } from '../../../data/user/publication-era-stats';
import { calculateReadingSurvivalStats } from '../../../data/user/reading-survival-stats';
import { buildCompletionRaceView } from './completion-race.presenter';
import { buildPeakHoursView } from './peak-hours.presenter';
import { buildPublicationEraView } from './publication-era.presenter';
import { buildPublicationTrendView } from './publication-trend.presenter';
import { buildReadingJourneyView } from './reading-journey.presenter';
import { buildReadingSurvivalView } from './reading-survival.presenter';
import { type LinePresenterContext } from './stats-line-family-chart.types';

const context: LinePresenterContext = {
  locale: 'en-GB',
  translate: (key) => key,
};

describe('stats line family presenters', () => {
  it('presents an empty publication trend', () => {
    const view = buildPublicationTrendView(calculatePublicationTrendStats([]), context);
    expect(view.hasData).toBe(false);
    expect(view.series).toEqual([]);
  });

  it('presents an empty reading journey', () => {
    const view = buildReadingJourneyView(calculateReadingJourneyStats([]), context);
    expect(view.hasData).toBe(false);
    expect(view.series).toHaveLength(2);
  });

  it('presents empty peak hours with both axes', () => {
    const view = buildPeakHoursView(mapPeakHours([]), context);
    expect(view.hasData).toBe(false);
    expect(view.yAxes).toHaveLength(2);
  });

  it('presents an empty publication era', () => {
    const view = buildPublicationEraView(calculatePublicationEraStats([]), context);
    expect(view.hasData).toBe(false);
    expect(view.series).toEqual([]);
  });

  it('presents an empty completion race for the selected year', () => {
    const view = buildCompletionRaceView(mapCompletionRaceStats([]), 2026, context);
    expect(view.hasData).toBe(false);
    expect(view.emptyMessage).toContain('statsUser.completionRace.noData');
  });

  it('presents an empty survival curve', () => {
    const view = buildReadingSurvivalView(calculateReadingSurvivalStats([]), context);
    expect(view.hasData).toBe(false);
    expect(view.series[0].stepped).toBe(true);
  });
});
