import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { StatsChartCardComponent } from './stats-chart-card.component';

@Component({
  imports: [StatsChartCardComponent],
  template: `
    <app-stats-chart-card heading="Test chart" [sectionedHeader]="true">
      <button type="button" data-content-control>Content control</button>
      <button type="button" statsChartActions data-header-control>Header control</button>
      <button type="button" statsChartSummary data-summary-control>Summary control</button>
    </app-stats-chart-card>
  `,
})
class TestHostComponent {}

@Component({
  imports: [StatsChartCardComponent],
  template: `
    <app-stats-chart-card
      heading="Loading chart"
      state="loading"
      loadingMessage="Loading test chart"
      [plotHeight]="180" />
  `,
})
class LoadingTestHostComponent {}

describe('StatsChartCardComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
    await fixture.whenStable();
  });

  it('insets the sectioned header divider to match the summary padding', () => {
    const divider = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-chart-header-divider]',
    );

    expect(divider).not.toBeNull();
    expect(divider?.classList.contains('inset-x-4')).toBe(true);
    expect(divider?.classList.contains('md:inset-x-5')).toBe(true);
  });

  it('owns the chart loading skeleton and its accessible label', async () => {
    const loadingFixture = TestBed.createComponent(LoadingTestHostComponent);
    await loadingFixture.whenStable();

    const status = (loadingFixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[role="status"]',
    );

    expect(status?.getAttribute('aria-label')).toBe('Loading test chart');
    expect(status?.style.height).toBe('180px');
  });
});
