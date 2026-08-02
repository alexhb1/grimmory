import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PageCountStats} from '../../../../data/library/page-count-stats';
import {PageCountChartComponent} from './page-count-chart.component';

const BUCKETS: PageCountStats['buckets'] = [
  {id: 'up-to-100', label: '0-100', minimum: 1, maximum: 100, bookCount: 2},
  {id: '101-to-200', label: '101-200', minimum: 101, maximum: 200, bookCount: 2},
  {id: '201-to-300', label: '201-300', minimum: 201, maximum: 300, bookCount: 2},
  {id: '301-to-500', label: '301-500', minimum: 301, maximum: 500, bookCount: 2},
  {id: '501-to-750', label: '501-750', minimum: 501, maximum: 750, bookCount: 2},
  {id: '751-to-1000', label: '751-1000', minimum: 751, maximum: 1000, bookCount: 2},
  {id: 'over-1000', label: '1000+', minimum: 1001, maximum: null, bookCount: 1},
];

describe('PageCountChartComponent', () => {
  const translate = vi.fn((key: string, params?: Record<string, number | string>) => !params
    ? key
    : `${key}|${Object.entries(params).map(([name, value]) => `${name}=${value}`).join('|')}`);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PageCountChartComponent],
      providers: [{provide: TranslocoService, useValue: {translate}}],
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
    const dataset = component.chartData().datasets[0];

    expect(component.chartData().labels).toEqual(BUCKETS.map(bucket => bucket.label));
    expect(dataset?.data).toEqual([2, 2, 2, 2, 2, 2, 1]);
    expect(dataset?.backgroundColor).toEqual([
      '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
    ]);
  });

  it('formats tooltip labels without raw-book access', () => {
    const component = createComponent({totalBooks: 0, buckets: []});
    const title = component.chartOptions?.plugins?.tooltip?.callbacks?.title as
      | ((context: {label: string}[]) => string)
      | undefined;
    const label = component.chartOptions?.plugins?.tooltip?.callbacks?.label as
      | ((context: {parsed: {y: number}}) => string)
      | undefined;

    expect(title?.([{label: '301-500'}]))
      .toBe('statsLibrary.pageCount.tooltipTitle|label=301-500');
    expect(label?.({parsed: {y: 1}})).toBe('statsLibrary.pageCount.tooltipLabel|value=1');
    expect(label?.({parsed: {y: 3}})).toBe('statsLibrary.pageCount.tooltipLabelPlural|value=3');
  });
});
