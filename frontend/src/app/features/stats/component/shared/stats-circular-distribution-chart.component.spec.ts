import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import {
  StatsCircularDistributionChartComponent,
  type StatsCircularDistribution,
} from './stats-circular-distribution-chart.component';

describe('StatsCircularDistributionChartComponent', () => {
  const translate = vi.fn((key: string, params?: Record<string, number | string>) =>
    params
      ? `${key}|${Object.entries(params).map(([name, value]) => `${name}=${value}`).join('|')}`
      : key,
  );

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StatsCircularDistributionChartComponent],
      providers: [{
        provide: TranslocoService,
        useValue: { translate, getActiveLang: () => 'en', langChanges$: of('en') },
      }],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(chart: StatsCircularDistribution) {
    const fixture = TestBed.createComponent(StatsCircularDistributionChartComponent);
    fixture.componentRef.setInput('chart', chart);
    return fixture.componentInstance;
  }

  it('renders book formats with their fixed colors and percentages', () => {
    const component = create({
      kind: 'book-formats',
      stats: {
        totalBooks: 4,
        formats: [{ format: 'EPUB', bookCount: 3 }, { format: 'PDF', bookCount: 1 }],
      },
    });

    expect(component.chartData().labels).toEqual(['EPUB', 'PDF']);
    expect(component.chartData().datasets[0]?.backgroundColor).toEqual(['#0D9488', '#E11D48']);
    expect(component.view().rows[0]?.tooltip).toBe(
      'statsLibrary.bookFormats.tooltipLabel|label=EPUB|value=3|percentage=75.0',
    );
  });

  it('renders language display names and fallback capitalization', () => {
    const component = create({
      kind: 'languages',
      stats: {
        totalBooks: 3,
        languages: [{ languageId: 'en', bookCount: 2 }, { languageId: 'klingon', bookCount: 1 }],
      },
    });

    expect(component.chartData().labels).toEqual(['English', 'Klingon']);
  });

  it('filters empty metadata buckets and retains the average', () => {
    const component = create({
      kind: 'metadata-score',
      stats: {
        totalBooks: 3,
        averageScore: 64,
        buckets: [
          { id: 'excellent', minimum: 90, maximum: 100, bookCount: 2 },
          { id: 'good', minimum: 70, maximum: 89, bookCount: 0 },
          { id: 'veryPoor', minimum: 0, maximum: 24, bookCount: 1 },
        ],
      },
    });

    expect(component.chartData().datasets[0]?.data).toEqual([2, 1]);
    expect(component.view().averageValue).toBe('64%');
    expect(component.view().rows[0]?.tooltip).toBe(
      'statsLibrary.metadataScore.tooltipLabel|value=2|percentage=66.7',
    );
  });

  it('uses the canonical read-status share in its tooltip', () => {
    const component = create({
      kind: 'read-status',
      stats: { slices: [{ status: ReadStatus.READ, bookCount: 2, sharePercent: 66.7 }] },
    });

    expect(component.view().rows[0]?.tooltip).toContain('percentage=66.7');
  });

  it('retains zero-count reading-progress bands when the result is non-empty', () => {
    const component = create({
      kind: 'reading-progress',
      stats: {
        totalBooks: 1,
        bands: [
          { id: 'not-started', label: '0%', bookCount: 0 },
          { id: 'completed', label: '100%', bookCount: 1 },
        ],
      },
    });

    expect(component.chartData().datasets[0]?.data).toEqual([0, 1]);
    expect(component.view().rows[0]?.tooltip).toContain('percentage=0.0');
  });
});
