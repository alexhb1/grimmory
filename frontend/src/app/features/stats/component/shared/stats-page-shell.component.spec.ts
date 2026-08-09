import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTranslocoModule } from '../../../../core/testing/transloco-testing';
import { LayoutService } from '../../../../shared/layout/layout.service';
import {
  StatsChartGridController,
  type StatsPageChartConfig,
} from './stats-chart-grid.controller';
import {
  StatsPageShellComponent,
  type StatsPageShellLabels,
} from './stats-page-shell.component';

const STORAGE_KEY = 'stats-page-shell-test';
const CHARTS: readonly StatsPageChartConfig[] = [
  { id: 'first', nameKey: 'first', size: 'small' },
  { id: 'second', nameKey: 'second', size: 'small' },
];

const LABELS: StatsPageShellLabels = {
  menu: 'Chart settings',
  showDescriptions: 'Show descriptions',
  edit: 'Edit charts',
  resetOrder: 'Reset order',
  addChart: 'Add chart',
  done: 'Done',
  chartName: ({ id }) => id === 'first' ? 'First' : 'Second',
  reorderChart: (chart) => `Reorder ${LABELS.chartName(chart)}`,
  removeChart: (chart) => `Remove ${LABELS.chartName(chart)}`,
  moveChartEarlier: (chart) => `Move ${LABELS.chartName(chart)} earlier`,
  moveChartLater: (chart) => `Move ${LABELS.chartName(chart)} later`,
};

@Component({
  imports: [StatsPageShellComponent],
  template: `
    <app-stats-page-shell
      [pageHeader]="{ title: 'Stats' }"
      [controller]="controller"
      [labels]="labels"
      [(showDescriptions)]="showDescriptions">
      <ng-template #chartTemplate let-chart>
        <button type="button" [attr.data-chart-content]="chart.id">{{ chart.id }}</button>
      </ng-template>
    </app-stats-page-shell>
  `,
})
class TestHostComponent {
  readonly labels = LABELS;
  readonly showDescriptions = signal(true);
  readonly controller = new StatsChartGridController({
    storageKey: STORAGE_KEY,
    defaults: CHARTS,
    label: LABELS.chartName,
  });
}

describe('StatsPageShellComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    localStorage.removeItem(STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, getTranslocoModule()],
      providers: [
        provideRouter([]),
        { provide: LiveAnnouncer, useValue: { announce: vi.fn() } },
        { provide: LayoutService, useValue: { isDesktop: signal(true) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('toggles description visibility from the chart settings menu', async () => {
    await openSettingsMenu();

    const checkbox = document.querySelector('app-menu-checkbox') as HTMLElement;
    expect(checkbox.getAttribute('aria-checked')).toBe('true');

    checkbox.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.showDescriptions()).toBe(false);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
  });

  it('makes chart contents inert while editing and restores trigger focus when done', async () => {
    await startEditing();

    expect(fixture.componentInstance.controller.isEditing()).toBe(true);
    expect(host().querySelector('[inert] [data-chart-content]')).not.toBeNull();

    buttonByText('Done').click();
    await fixture.whenStable();

    expect(fixture.componentInstance.controller.isEditing()).toBe(false);
    expect(host().querySelector('[inert]')).toBeNull();
    expect(document.activeElement).toBe(settingsTrigger());
  });

  it('restores chart focus after keyboard reordering and removal', async () => {
    await startEditing();

    let secondHandle = reorderHandle('second');
    secondHandle.focus();
    secondHandle.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    }));
    await fixture.whenStable();

    secondHandle = reorderHandle('second');
    expect(fixture.componentInstance.controller.enabledCharts().map(({ id }) => id)).toEqual([
      'second',
      'first',
    ]);
    expect(document.activeElement).toBe(secondHandle);

    (host().querySelector('[aria-label="Remove Second"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.controller.enabledCharts().map(({ id }) => id)).toEqual([
      'first',
    ]);
    expect(document.activeElement).toBe(reorderHandle('first'));
  });

  async function openSettingsMenu(): Promise<void> {
    settingsTrigger().click();
    await fixture.whenStable();
  }

  async function startEditing(): Promise<void> {
    await openSettingsMenu();
    const editItem = [...document.querySelectorAll<HTMLElement>('app-menu-item')]
      .find((item) => item.textContent?.includes('Edit charts'));
    if (!editItem) throw new Error('Expected edit menu item');
    editItem.click();
    await fixture.whenStable();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function settingsTrigger(): HTMLButtonElement {
    return host().querySelector('#stats-page-config-trigger') as HTMLButtonElement;
  }

  function buttonByText(text: string): HTMLButtonElement {
    const button = [...host().querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent?.includes(text));
    if (!button) throw new Error(`Expected ${text} button`);
    return button;
  }

  function reorderHandle(chartId: string): HTMLElement {
    return host().querySelector(`[data-chart-reorder-handle="${chartId}"]`) as HTMLElement;
  }
});
