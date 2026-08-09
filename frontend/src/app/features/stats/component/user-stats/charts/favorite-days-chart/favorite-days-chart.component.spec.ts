import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FavoriteDaysChartComponent } from './favorite-days-chart.component';

describe('FavoriteDaysChartComponent', () => {
  let component: FavoriteDaysChartComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TranslocoService,
          useValue: {
            langChanges$: new BehaviorSubject('en'),
            getActiveLang: () => 'en',
            translate: (key: string) => key,
          },
        },
      ],
    });

    component = TestBed.runInInjectionContext(() => new FavoriteDaysChartComponent());
  });

  afterEach(() => TestBed.resetTestingModule());

  it('does not round a duration below two hours to 1h 60m', () => {
    const options = component['chartOptions']();
    const label = options?.plugins?.tooltip?.callbacks?.label as unknown as (
      context: { dataset: { label: string; yAxisID: string }; parsed: { y: number } },
    ) => string;

    expect(
      label({
        dataset: { label: 'Duration', yAxisID: 'y1' },
        parsed: { y: 1.999 },
      }),
    ).toBe('Duration: 1h 59m');
  });
});
