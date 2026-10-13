import {TestBed} from '@angular/core/testing';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {type RunningMonth} from '../../../shared/stats-chart-data';
import {createStatsChart, insightPairs} from '../../../shared/stats-chart-testing';
import {ReadingJourneyChartComponent} from './reading-journey-chart.component';

const MONTHS: RunningMonth[] = [
  {month: '2026-01', added: 0, finished: 2, totalAdded: 0, totalFinished: 2, backlog: 0},
  {month: '2026-02', added: 3, finished: 0, totalAdded: 3, totalFinished: 2, backlog: 3},
  {month: '2026-03', added: 1, finished: 4, totalAdded: 4, totalFinished: 6, backlog: 0},
];

describe('ReadingJourneyChartComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('reads the backlog, its change since the same month last year and the month with most added, leaving out the change until the history spans a year', () => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(new Date(2027, 1, 20, 12));
    const chart = createStatsChart(ReadingJourneyChartComponent, MONTHS);

    expect(chart.yearAgo()?.month).toBe('2026-02');
    expect(insightPairs(chart.insights())).toEqual([
      ['insightCurrentBacklog', '0'],
      ['insightLastTwelveMonths', '-3'],
      ['legendBooksFinished', '6'],
      ['insightMostAdded', '3'],
    ]);

    TestBed.resetTestingModule();
    vi.setSystemTime(new Date(2026, 2, 20, 12));
    const recent = createStatsChart(ReadingJourneyChartComponent, MONTHS);

    expect(recent.yearAgo()).toBeNull();
    expect(insightPairs(recent.insights())).toEqual([
      ['insightCurrentBacklog', '0'],
      ['legendBooksFinished', '6'],
      ['insightMostAdded', '3'],
    ]);
    vi.useRealTimers();
  });
});
