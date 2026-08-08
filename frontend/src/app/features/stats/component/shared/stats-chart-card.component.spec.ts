import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  StatsChartCardComponent,
  type StatsChartState,
} from './stats-chart-card.component';

@Component({
  imports: [StatsChartCardComponent],
  template: `
    <app-stats-chart-card
      heading="Test chart"
      [sectionedHeader]="true"
      [state]="state()"
      loadingMessage="Loading test chart"
      [plotHeight]="240">
      <button type="button" data-content-control>Content control</button>
      <button type="button" statsChartActions data-header-control>Header control</button>
      <button type="button" statsChartSummary data-summary-control>Summary control</button>
    </app-stats-chart-card>
  `,
})
class TestHostComponent {
  readonly state = signal<StatsChartState>('ready');
}

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

  it('owns the shared loading presentation', async () => {
    fixture.componentInstance.state.set('loading');
    await fixture.whenStable();

    const loading = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[role="status"]',
    );
    expect(loading?.getAttribute('aria-label')).toBe('Loading test chart');
    expect(loading?.style.height).toBe('240px');
    expect(fixture.nativeElement.querySelector('[data-content-control]')).toBeNull();
  });
});
