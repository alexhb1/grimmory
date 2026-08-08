import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {MetadataScoreStats} from '../../../../data/library/metadata-score-stats';
import {MetadataScoreChartComponent} from './metadata-score-chart.component';

interface TooltipContext {
  parsed: number;
  dataset: {data: number[]};
}

describe('MetadataScoreChartComponent', () => {
  const translate = vi.fn((key: string, params?: Record<string, number | string>) => !params
    ? key
    : `${key}|${Object.entries(params).map(([name, value]) => `${name}=${value}`).join('|')}`);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MetadataScoreChartComponent],
      providers: [{provide: TranslocoService, useValue: {translate}}],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function createComponent(stats: MetadataScoreStats): MetadataScoreChartComponent {
    const fixture = TestBed.createComponent(MetadataScoreChartComponent);
    fixture.componentRef.setInput('stats', stats);
    return fixture.componentInstance;
  }

  it('renders typed score buckets and their translated labels', () => {
    const component = createComponent({
      totalBooks: 9,
      averageScore: 52,
      buckets: [
        {id: 'excellent', minimum: 90, maximum: 100, bookCount: 1},
        {id: 'good', minimum: 70, maximum: 89, bookCount: 2},
        {id: 'fair', minimum: 50, maximum: 69, bookCount: 2},
        {id: 'poor', minimum: 25, maximum: 49, bookCount: 2},
        {id: 'veryPoor', minimum: 0, maximum: 24, bookCount: 2},
      ],
    });

    expect(component.averageScore()).toBe(52);
    expect(component.chartData().labels).toEqual([
      'statsLibrary.metadataScore.excellent',
      'statsLibrary.metadataScore.good',
      'statsLibrary.metadataScore.fair',
      'statsLibrary.metadataScore.poor',
      'statsLibrary.metadataScore.veryPoor',
    ]);
    expect(component.chartData().datasets[0]?.data).toEqual([1, 2, 2, 2, 2]);
    expect(component.chartData().datasets[0]?.backgroundColor).toEqual([
      '#16A34A', '#22C55E', '#F59E0B', '#F97316', '#DC2626',
    ]);
  });

  it('renders an empty result without chart datasets', () => {
    const component = createComponent({totalBooks: 0, averageScore: null, buckets: []});
    expect(component.chartData()).toEqual({labels: [], datasets: []});
  });

  it('formats tooltips from typed result counts', () => {
    const component = createComponent({
      totalBooks: 3,
      averageScore: 64,
      buckets: [
        {id: 'excellent', minimum: 90, maximum: 100, bookCount: 2},
        {id: 'veryPoor', minimum: 0, maximum: 24, bookCount: 1},
      ],
    });
    const callback = component.chartOptions?.plugins?.tooltip?.callbacks?.label as
      | ((context: TooltipContext) => string)
      | undefined;

    expect(callback?.({parsed: 2, dataset: {data: [2, 1]}}))
      .toBe('statsLibrary.metadataScore.tooltipLabel|value=2|percentage=66.7');
  });
});
