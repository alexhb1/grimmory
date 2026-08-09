import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  BookFormatStats,
  UNKNOWN_BOOK_FORMAT_ID,
} from '../../../../data/library/book-format-stats';
import {BookFormatsChartComponent} from './book-formats-chart.component';

interface TooltipContext {
  parsed: number;
  dataset: {data: number[]};
  label: string;
}

describe('BookFormatsChartComponent', () => {
  const translate = vi.fn((key: string, params?: Record<string, number | string>) => !params
    ? key
    : `${key}|${Object.entries(params).map(([name, value]) => `${name}=${value}`).join('|')}`);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookFormatsChartComponent],
      providers: [{provide: TranslocoService, useValue: {
        translate,
        langChanges$: of('en'),
        getActiveLang: () => 'en',
      }}],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function createComponent(stats: BookFormatStats): BookFormatsChartComponent {
    const fixture = TestBed.createComponent(BookFormatsChartComponent);
    fixture.componentRef.setInput('stats', stats);
    return fixture.componentInstance;
  }

  it('renders the typed format result without regrouping books', () => {
    const component = createComponent({
      totalBooks: 10,
      formats: [
        {format: 'EPUB', bookCount: 4},
        {format: 'PDF', bookCount: 3},
        {format: 'AUDIOBOOK', bookCount: 2},
        {format: UNKNOWN_BOOK_FORMAT_ID, bookCount: 1},
      ],
    });

    expect(component.totalBooks()).toBe(10);
    expect(component.chartData().labels).toEqual([
      'EPUB',
      'PDF',
      'AUDIOBOOK',
      'statsLibrary.bookFormats.unknown',
    ]);
    expect(component.chartData().datasets[0]?.data).toEqual([4, 3, 2, 1]);
    expect(component.chartData().datasets[0]?.backgroundColor).toEqual([
      '#0D9488', '#E11D48', '#6B7280', '#6B7280',
    ]);
  });

  it('formats tooltips from the renderer data', () => {
    const component = createComponent({
      totalBooks: 4,
      formats: [{format: 'EPUB', bookCount: 3}, {format: 'PDF', bookCount: 1}],
    });
    const callback = component.chartOptions?.plugins?.tooltip?.callbacks?.label as
      | ((context: TooltipContext) => string)
      | undefined;

    expect(callback?.({parsed: 3, dataset: {data: [3, 1]}, label: 'EPUB'}))
      .toBe('statsLibrary.bookFormats.tooltipLabel|label=EPUB|value=3|percentage=75.0');
  });
});
