import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {LanguageStats} from '../../../../data/library/language-stats';
import {LanguageChartComponent} from './language-chart.component';

interface TooltipContext {
  parsed: number;
  dataset: {data: number[]};
  label: string;
}

describe('LanguageChartComponent', () => {
  const translate = vi.fn((key: string, params?: Record<string, number | string>) => !params
    ? key
    : `${key}|${Object.entries(params).map(([name, value]) => `${name}=${value}`).join('|')}`);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LanguageChartComponent],
      providers: [{provide: TranslocoService, useValue: {translate}}],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function createComponent(stats: LanguageStats): LanguageChartComponent {
    const fixture = TestBed.createComponent(LanguageChartComponent);
    fixture.componentRef.setInput('stats', stats);
    return fixture.componentInstance;
  }

  it('renders canonical language results with display labels', () => {
    const component = createComponent({
      totalBooks: 7,
      languages: [
        {languageId: 'en', bookCount: 4},
        {languageId: 'es', bookCount: 2},
        {languageId: 'klingon', bookCount: 1},
      ],
    });

    expect(component.booksWithLanguage()).toBe(7);
    expect(component.chartData().labels).toEqual(['English', 'Spanish', 'Klingon']);
    expect(component.chartData().datasets[0]?.data).toEqual([4, 2, 1]);
  });

  it('renders an empty result without chart datasets', () => {
    const component = createComponent({totalBooks: 0, languages: []});
    expect(component.chartData()).toEqual({labels: [], datasets: []});
  });

  it('formats tooltips from typed result counts', () => {
    const component = createComponent({
      totalBooks: 5,
      languages: [{languageId: 'en', bookCount: 3}, {languageId: 'es', bookCount: 2}],
    });
    const callback = component.chartOptions?.plugins?.tooltip?.callbacks?.label as
      | ((context: TooltipContext) => string)
      | undefined;

    expect(callback?.({parsed: 3, dataset: {data: [3, 2]}, label: 'English'}))
      .toBe('statsLibrary.language.tooltipLabel|label=English|value=3|percentage=60.0');
  });
});
