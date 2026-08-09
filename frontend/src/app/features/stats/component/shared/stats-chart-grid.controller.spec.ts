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

  it('adds a removed chart and resets enabled charts to their default order', () => {
    const controller = createController();

    controller.remove('second');
    controller.move('third', -1);
    controller.add('second');
    expect(controller.enabledCharts().map(({ id }) => id)).toEqual([
      'third',
      'first',
      'full',
      'second',
    ]);

    controller.resetOrder();
    expect(controller.enabledCharts().map(({ id }) => id)).toEqual([
      'first',
      'second',
      'third',
      'full',
    ]);
  });

  it('reorders within a row from a drag/drop event', () => {
    const controller = createController();
    const row = controller.rows().find(({ charts }) => charts.length > 1);
    if (!row) throw new Error('Expected a multi-chart row');

    controller.reorder({
      previousContainer: { id: row.id },
      container: { id: row.id },
      previousIndex: 0,
      currentIndex: 1,
    } as Parameters<StatsChartGridController['reorder']>[0]);

    expect(controller.enabledCharts().slice(0, 3).map(({ id }) => id)).toEqual([
      'second',
      'first',
      'third',
    ]);
  });

  it('supports Home and End keys and falls back from corrupt persistence', () => {
    localStorage.setItem(STORAGE_KEY, '{invalid');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controller = createController();
    expect(controller.enabledCharts()).toHaveLength(CHARTS.length);

    const home = new KeyboardEvent('keydown', { key: 'Home', cancelable: true });
    controller.reorderKeydown(home, 'third');
    expect(home.defaultPrevented).toBe(true);
    expect(controller.enabledCharts()[0].id).toBe('third');

    const end = new KeyboardEvent('keydown', { key: 'End', cancelable: true });
    controller.reorderKeydown(end, 'third');
    expect(controller.enabledCharts().at(-1)?.id).toBe('third');
    consoleError.mockRestore();
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
