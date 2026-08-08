import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  StatsReadingProfileChartComponent,
  type StatsReadingProfile,
} from './stats-reading-profile-chart.component';

describe('StatsReadingProfileChartComponent', () => {
  const translate = vi.fn((key: string, params?: Record<string, number | string>) =>
    params
      ? `${key}|${Object.entries(params).map(([name, value]) => `${name}=${value}`).join('|')}`
      : key,
  );

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StatsReadingProfileChartComponent],
      providers: [{
        provide: TranslocoService,
        useValue: { translate, getActiveLang: () => 'en', langChanges$: of('en') },
      }],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(profile: StatsReadingProfile) {
    const fixture = TestBed.createComponent(StatsReadingProfileChartComponent);
    fixture.componentRef.setInput('profile', profile);
    return fixture.componentInstance;
  }

  it.each([
    ['dna', 'adventurous', '#e91e63', '#e91e63'],
    ['habits', 'consistency', '#9c27b0', '#9c27b0'],
  ] as const)('renders the %s profile through the shared radar', (kind, id, pointColor, lineColor) => {
    const profile = kind === 'dna'
      ? { kind, stats: [{ id, score: 72, level: 'high' as const }] }
      : { kind, stats: [{ id, score: 72, level: 'high' as const }] };
    const component = create(profile);

    expect(component.chartData().datasets[0]?.data).toEqual([72]);
    expect(component.chartData().datasets[0]?.pointBackgroundColor).toEqual([pointColor]);
    expect(component.chartData().datasets[0]?.borderColor).toBe(lineColor);
    expect(component.view().metrics[0]?.description).toContain(`descriptions.${id}.high`);
  });
});
