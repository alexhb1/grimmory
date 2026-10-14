import {TestBed} from '@angular/core/testing';
import {afterEach, describe, expect, it} from 'vitest';

import {type StatsFinishedBook} from '../../../../data/stats-response.models';
import {createStatsChart, insightPairs} from '../../../shared/stats-chart-testing';
import {DaysToFinishChartComponent} from './days-to-finish-chart.component';

function book(id: number, days: number): StatsFinishedBook {
  return {title: `Book ${id}`, days};
}

describe('DaysToFinishChartComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('groups every finished book by how long it took and names the quickest and longest', () => {
    const chart = createStatsChart(DaysToFinishChartComponent, {
      year: 2026,
      books: [book(8, 0), book(2, 6), book(3, 7), book(5, 27), book(6, 28), book(4, 50), book(7, 89), book(1, 92)],
    });

    expect(chart.buckets().map(({id, source}) => [id, source.map(({title}) => title)])).toEqual([
      ['underAWeek', ['Book 8', 'Book 2']],
      ['oneToTwoWeeks', ['Book 3']],
      ['twoToFourWeeks', ['Book 5']],
      ['oneToTwoMonths', ['Book 6', 'Book 4']],
      ['twoToThreeMonths', ['Book 7']],
      ['threeMonthsOrMore', ['Book 1']],
    ]);
    expect(insightPairs(chart.insights())).toEqual([
      ['booksFinished', '8'],
      ['median', '28 days'],
      ['quickest', '0 days'],
      ['longest', '92 days'],
    ]);
    expect(chart.insights().slice(2).map(({detail}) => detail)).toEqual(['Book 8', 'Book 1']);
  });
});
