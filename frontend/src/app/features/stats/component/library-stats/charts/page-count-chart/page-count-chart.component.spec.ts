import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PageCountStats} from '../../../../data/library/page-count-stats';
import {PageCountChartComponent} from './page-count-chart.component';

const BUCKETS: PageCountStats['buckets'] = [
  {id: 'up-to-100', label: '0-100', bookCount: 2},
  {id: '101-to-200', label: '101-200', bookCount: 2},
  {id: '201-to-300', label: '201-300', bookCount: 2},
  {id: '301-to-500', label: '301-500', bookCount: 2},
  {id: '501-to-750', label: '501-750', bookCount: 2},
  {id: '751-to-1000', label: '751-1000', bookCount: 2},
  {id: 'over-1000', label: '1001+', bookCount: 1},
];

describe('PageCountChartComponent', () => {
  const translate = vi.fn((key: string, params?: Record<string, number | string>) => !params
    ? key
    : `${key}|${Object.entries(params).map(([name, value]) => `${name}=${value}`).join('|')}`);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PageCountChartComponent],
      providers: [{
        provide: TranslocoService,
        useValue: {translate, getActiveLang: () => 'en', langChanges$: of('en')},
      }],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function createComponent(stats: PageCountStats): PageCountChartComponent {
    const fixture = TestBed.createComponent(PageCountChartComponent);
    fixture.componentRef.setInput('stats', stats);
    return fixture.componentInstance;
  }

  it('renders every typed page-count bucket', () => {
    const component = createComponent({totalBooks: 13, buckets: BUCKETS});
    const plot = component.plot();

    expect(plot.categories.map(category => category.label)).toEqual(BUCKETS.map(bucket => bucket.label));
    expect(plot.series[0]?.values.map(datum => datum.value)).toEqual([2, 2, 2, 2, 2, 2, 1]);
    expect(plot.series[0]?.values.map(datum => datum.color)).toEqual([
      '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
    ]);
  });

  it('formats tooltip labels without raw-book access', () => {
    const component = createComponent({totalBooks: 6, buckets: [
      {id: '301-to-500', label: '301-500', bookCount: 1},
      {id: '501-to-750', label: '501-750', bookCount: 5},
    ]});
    const plot = component.plot();

    expect(plot.categories[0]?.tooltipTitle)
      .toBe('statsLibrary.pageCount.tooltipTitle|label=301-500');
    expect(plot.series[0]?.values[0]?.tooltipLines).toEqual([
      'statsLibrary.pageCount.tooltipLabel|value=1',
    ]);
    expect(plot.series[0]?.values[1]?.tooltipLines).toEqual([
      'statsLibrary.pageCount.tooltipLabelPlural|value=5',
    ]);
  });
});
