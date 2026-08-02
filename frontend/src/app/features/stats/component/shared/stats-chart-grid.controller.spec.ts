import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  StatsChartGridController,
  type StatsPageChartConfig,
} from './stats-chart-grid.controller';

const STORAGE_KEY = 'stats-chart-grid-controller-test';
const CHARTS: readonly StatsPageChartConfig[] = [
  { id: 'first', nameKey: 'first', size: 'small' },
  { id: 'second', nameKey: 'second', size: 'small' },
  { id: 'third', nameKey: 'third', size: 'small' },
  { id: 'full', nameKey: 'full', size: 'full' },
];

describe('StatsChartGridController', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: LiveAnnouncer, useValue: { announce: vi.fn() } }],
    });
  });

  it('previews all three small charts as thirds before the drop settles', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 4,
      rows: [['first'], ['second', 'third']],
      disabled: [],
    }));
    const controller = TestBed.runInInjectionContext(() =>
      new StatsChartGridController({
        storageKey: STORAGE_KEY,
        defaults: CHARTS,
        label: ({ id }) => id,
      }),
    );
    const sourceRow = controller.rows().at(0);
    const targetRow = controller.rows().at(1);
    if (!sourceRow || !targetRow) throw new Error('Expected two chart rows');

    const draggedChart = sourceRow.charts.at(0);
    if (!draggedChart) throw new Error('Expected a chart in the source row');

    controller.startReorderPreview(sourceRow.id, draggedChart);
    controller.previewReorder(targetRow.id, 2);

    expect(controller.previewLayout(targetRow.id)).toBe('thirds');
  });

  it('previews an incompatible target as a separate row', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 4,
      rows: [['first'], ['full'], ['second', 'third']],
      disabled: [],
    }));
    const controller = TestBed.runInInjectionContext(() =>
      new StatsChartGridController({
        storageKey: STORAGE_KEY,
        defaults: CHARTS,
        label: ({ id }) => id,
      }),
    );
    const sourceRow = controller.rows().at(0);
    const targetRow = controller.rows().at(1);
    if (!sourceRow || !targetRow) throw new Error('Expected two chart rows');

    const draggedChart = sourceRow.charts.at(0);
    if (!draggedChart) throw new Error('Expected a chart in the source row');

    controller.startReorderPreview(sourceRow.id, draggedChart);
    controller.previewReorder(targetRow.id, 0);

    expect(controller.previewLayout(targetRow.id)).toBe('new-row');
  });

  it('moves exactly one position across an incompatible row boundary', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 4,
      rows: [['full'], ['first', 'second'], ['third']],
      disabled: [],
    }));
    const controller = createController();

    controller.move('full', 1);

    expect(controller.enabledCharts().map(({ id }) => id)).toEqual([
      'first',
      'full',
      'second',
      'third',
    ]);
  });

  it('loads the legacy flat layout and persists disabled charts from row membership', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'second', enabled: true },
      { id: 'first', enabled: false },
      { id: 'full', enabled: true },
    ]));
    const controller = createController();

    expect(controller.enabledCharts().map(({ id }) => id)).toEqual(['second', 'full', 'third']);
    expect(controller.availableCharts().map(({ id }) => id)).toEqual(['first']);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 4,
      rows: [['second'], ['full'], ['third']],
      disabled: ['first'],
    });

    controller.remove('second');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').disabled).toEqual([
      'first',
      'second',
    ]);
  });

  function createController(): StatsChartGridController {
    return TestBed.runInInjectionContext(() =>
      new StatsChartGridController({
        storageKey: STORAGE_KEY,
        defaults: CHARTS,
        label: ({ id }) => id,
      }),
    );
  }
});
