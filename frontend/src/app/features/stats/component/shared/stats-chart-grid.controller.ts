import { LiveAnnouncer } from '@angular/cdk/a11y';
import { type CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { computed, inject, signal, type Signal, type WritableSignal } from '@angular/core';

import {
  isValidStatsChartRow,
  packStatsChartRows,
  statsChartRowLayout,
  type StatsPageChartConfig,
  type StatsChartRowLayout,
  type StatsChartSize,
} from './stats-chart-layout';

export type { StatsChartSize, StatsPageChartConfig } from './stats-chart-layout';

export interface StatsChartLayoutRow {
  readonly id: string;
  readonly charts: readonly StatsPageChartConfig[];
}

export interface StatsChartGridOptions {
  readonly storageKey: string;
  readonly defaults: readonly StatsPageChartConfig[];
  readonly label: (chart: StatsPageChartConfig) => string;
}

interface StoredStatsChartLayout {
  readonly version: 4;
  readonly rows: readonly (readonly string[])[];
  readonly disabled: readonly string[];
}

interface MutableStatsChartLayoutRow {
  readonly id: string;
  charts: StatsPageChartConfig[];
}

interface StatsChartReorderPreview {
  readonly sourceRowId: string;
  readonly chart: StatsPageChartConfig;
}

export type StatsChartPreviewLayout = StatsChartRowLayout | 'new-row';

export const STATS_CHART_DRAG_START_DELAY = { touch: 180, mouse: 0 } as const;

const PLOT_HEIGHTS: Readonly<Record<StatsChartSize, number>> = {
  small: 240,
  medium: 300,
  wide: 340,
  full: 380,
};

let nextRowId = 0;

export class StatsChartGridController {
  private readonly liveAnnouncer = inject(LiveAnnouncer);
  private readonly storageKey: string;
  private readonly defaults: readonly StatsPageChartConfig[];
  private readonly defaultsById: ReadonlyMap<string, StatsPageChartConfig>;
  private readonly label: (chart: StatsPageChartConfig) => string;
  private readonly rowsState: WritableSignal<readonly StatsChartLayoutRow[]>;
  private readonly reorderPreviewState = signal<StatsChartReorderPreview | null>(null);
  private readonly previewLayoutsState = signal<ReadonlyMap<string, StatsChartPreviewLayout>>(new Map());

  readonly rows: Signal<readonly StatsChartLayoutRow[]>;
  readonly enabledCharts: Signal<readonly StatsPageChartConfig[]>;
  readonly availableCharts: Signal<readonly StatsPageChartConfig[]>;
  readonly isEditing = signal(false);

  constructor(options: StatsChartGridOptions) {
    this.storageKey = options.storageKey;
    this.defaults = options.defaults;
    this.defaultsById = new Map(options.defaults.map((chart) => [chart.id, chart]));
    this.label = options.label;

    this.rowsState = signal(this.loadLayout());
    this.rows = this.rowsState.asReadonly();
    this.enabledCharts = computed(() => this.rows().flatMap(({ charts }) => charts));
    this.availableCharts = computed(() => {
      const enabled = new Set(this.enabledCharts().map(({ id }) => id));
      return this.defaults.filter(({ id }) => !enabled.has(id));
    });
  }

  plotHeight(size: StatsChartSize): number {
    return PLOT_HEIGHTS[size];
  }

  isFirst(chartId: string): boolean {
    return this.enabledCharts()[0]?.id === chartId;
  }

  isLast(chartId: string): boolean {
    return this.enabledCharts().at(-1)?.id === chartId;
  }

  previewLayout(rowId: string): StatsChartPreviewLayout | null {
    return this.previewLayoutsState().get(rowId) ?? null;
  }

  startReorderPreview(sourceRowId: string, chart: StatsPageChartConfig): void {
    this.reorderPreviewState.set({ sourceRowId, chart });
    this.previewLayoutsState.set(new Map());
  }

  previewReorder(targetRowId: string, currentIndex: number): void {
    const preview = this.reorderPreviewState();
    const sourceRow = this.rows().find(({ id }) => id === preview?.sourceRowId);
    const targetRow = this.rows().find(({ id }) => id === targetRowId);
    if (!preview || !sourceRow || !targetRow || sourceRow.id === targetRow.id) {
      this.previewLayoutsState.set(new Map());
      return;
    }

    const sourceCharts = sourceRow.charts.filter(({ id }) => id !== preview.chart.id);
    const targetCharts = [...targetRow.charts];
    const insertAt = Math.max(0, Math.min(currentIndex, targetCharts.length));
    targetCharts.splice(insertAt, 0, preview.chart);

    const layouts = new Map<string, StatsChartPreviewLayout>();
    if (sourceCharts.length > 0) layouts.set(sourceRow.id, statsChartRowLayout(sourceCharts));
    if (isValidStatsChartRow(targetCharts)) {
      layouts.set(targetRow.id, statsChartRowLayout(targetCharts));
    } else {
      layouts.set(targetRow.id, 'new-row');
    }
    this.previewLayoutsState.set(layouts);
  }

  clearReorderPreview(): void {
    this.reorderPreviewState.set(null);
    this.previewLayoutsState.set(new Map());
  }

  startEditing(): void {
    this.isEditing.set(true);
  }

  finishEditing(): void {
    this.isEditing.set(false);
  }

  add(chartId: string): void {
    const chart = this.defaultsById.get(chartId);
    if (!chart || this.enabledCharts().some(({ id }) => id === chartId)) return;

    this.setLayout([...this.rows(), this.makeRow([chart])]);
  }

  remove(chartId: string): void {
    if (!this.enabledCharts().some(({ id }) => id === chartId)) return;

    const rows = this.rows()
      .map((row) => ({ ...row, charts: row.charts.filter(({ id }) => id !== chartId) }))
      .filter(({ charts }) => charts.length > 0);
    this.setLayout(rows);
  }

  reorder(event: CdkDragDrop<readonly StatsPageChartConfig[]>): void {
    const sourceRow = this.rows().find(({ id }) => id === event.previousContainer.id);
    const targetRow = this.rows().find(({ id }) => id === event.container.id);
    if (!sourceRow || !targetRow) return;

    const rows = this.mutableRows();
    const mutableSource = rows.find(({ id }) => id === sourceRow.id);
    if (!mutableSource) return;

    if (sourceRow.id === targetRow.id) {
      moveItemInArray(mutableSource.charts, event.previousIndex, event.currentIndex);
      this.setLayout(rows);
      return;
    }

    const chart = mutableSource.charts.at(event.previousIndex);
    if (!chart) return;
    mutableSource.charts.splice(event.previousIndex, 1);
    if (mutableSource.charts.length === 0) {
      rows.splice(rows.indexOf(mutableSource), 1);
    }

    const mutableTarget = rows.find(({ id }) => id === targetRow.id);
    if (!mutableTarget) return;

    const insertAt = Math.max(0, Math.min(event.currentIndex, mutableTarget.charts.length));
    const candidate = [...mutableTarget.charts];
    candidate.splice(insertAt, 0, chart);

    if (isValidStatsChartRow(candidate)) {
      mutableTarget.charts = candidate;
    } else {
      const targetIndex = rows.indexOf(mutableTarget);
      rows.splice(
        targetIndex,
        1,
        ...packStatsChartRows(candidate).map((charts) => this.mutableRow([...charts])),
      );
    }

    this.setLayout(rows);
  }

  reorderKeydown(event: KeyboardEvent, chartId: string): void {
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.move(chartId, -1);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.move(chartId, 1);
        break;
      case 'Home':
        event.preventDefault();
        event.stopPropagation();
        this.moveToEdge(chartId, 'start');
        break;
      case 'End':
        event.preventDefault();
        event.stopPropagation();
        this.moveToEdge(chartId, 'end');
        break;
    }
  }

  move(chartId: string, delta: -1 | 1): void {
    const charts = this.enabledCharts();
    const currentIndex = charts.findIndex(({ id }) => id === chartId);
    if (currentIndex < 0) return;

    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= charts.length) return;

    this.moveToIndex(chartId, targetIndex);
  }

  resetOrder(): void {
    const enabled = new Set(this.enabledCharts().map(({ id }) => id));
    const charts = this.defaults.filter(({ id }) => enabled.has(id));
    this.setLayout(this.makeRows(packStatsChartRows(charts)));
  }

  private moveToEdge(chartId: string, edge: 'start' | 'end'): void {
    this.moveToIndex(chartId, edge === 'start' ? 0 : this.enabledCharts().length - 1);
  }

  private moveToIndex(chartId: string, targetIndex: number): void {
    const charts = [...this.enabledCharts()];
    const currentIndex = charts.findIndex(({ id }) => id === chartId);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= charts.length) return;

    const [chart] = charts.splice(currentIndex, 1);
    charts.splice(targetIndex, 0, chart);
    this.setLayout(this.makeRows(packStatsChartRows(charts)));
    void this.liveAnnouncer.announce(
      `${this.label(chart)}, ${targetIndex + 1} / ${charts.length}`,
    );
  }

  private setLayout(rows: readonly StatsChartLayoutRow[]): void {
    const nonEmptyRows = rows.filter(({ charts }) => charts.length > 0);
    this.rowsState.set(nonEmptyRows);
    this.persistLayout(nonEmptyRows);
  }

  private persistLayout(rows: readonly StatsChartLayoutRow[]): void {
    const enabled = new Set(rows.flatMap(({ charts }) => charts.map(({ id }) => id)));

    const stored: StoredStatsChartLayout = {
      version: 4,
      rows: rows.map(({ charts }) => charts.map(({ id }) => id)),
      disabled: this.defaults.filter(({ id }) => !enabled.has(id)).map(({ id }) => id),
    };
    localStorage.setItem(this.storageKey, JSON.stringify(stored));
  }

  private loadLayout(): readonly StatsChartLayoutRow[] {
    const savedConfig = localStorage.getItem(this.storageKey);
    if (!savedConfig) return this.defaultLayout();

    try {
      const saved = JSON.parse(savedConfig) as unknown;
      if (!Array.isArray(saved)) return this.loadRowLayout(saved);

      const rows = this.loadLegacyLayout(saved);
      this.persistLayout(rows);
      return rows;
    } catch (error) {
      console.error('Failed to load chart config', error);
      return this.defaultLayout();
    }
  }

  private loadLegacyLayout(saved: readonly unknown[]): readonly StatsChartLayoutRow[] {
    const remaining = new Map(this.defaultsById);
    const enabled: StatsPageChartConfig[] = [];

    for (const value of saved) {
      if (!this.isLegacyEntry(value)) continue;
      const chart = remaining.get(value.id);
      if (!chart) continue;

      remaining.delete(chart.id);
      if (value.enabled ?? true) {
        enabled.push(chart);
      }
    }

    for (const chart of remaining.values()) {
      enabled.push(chart);
    }

    return this.makeRows(packStatsChartRows(enabled));
  }

  private loadRowLayout(saved: unknown): readonly StatsChartLayoutRow[] {
    if (!this.isStoredLayout(saved)) return this.defaultLayout();

    const disabled = new Set(saved.disabled.filter((id) => this.defaultsById.has(id)));
    const used = new Set<string>();
    const rows: StatsChartLayoutRow[] = [];

    for (const savedRow of saved.rows) {
      const charts = savedRow.flatMap((id) => {
        const chart = this.defaultsById.get(id);
        if (!chart || disabled.has(id) || used.has(id)) return [];
        used.add(id);
        return [chart];
      });
      rows.push(...this.makeRows(packStatsChartRows(charts)));
    }

    const newEnabled: StatsPageChartConfig[] = [];
    for (const chart of this.defaults) {
      if (used.has(chart.id) || disabled.has(chart.id)) continue;
      used.add(chart.id);
      newEnabled.push(chart);
    }
    rows.push(...this.makeRows(packStatsChartRows(newEnabled)));

    return rows;
  }

  private defaultLayout(): readonly StatsChartLayoutRow[] {
    return this.makeRows(packStatsChartRows(this.defaults));
  }

  private makeRows(
    rows: readonly (readonly StatsPageChartConfig[])[],
  ): readonly StatsChartLayoutRow[] {
    return rows.map((charts) => this.makeRow(charts));
  }

  private makeRow(charts: readonly StatsPageChartConfig[]): StatsChartLayoutRow {
    return { id: `stats-chart-row-${nextRowId++}`, charts };
  }

  private mutableRows(): MutableStatsChartLayoutRow[] {
    return this.rows().map(({ id, charts }) => ({ id, charts: [...charts] }));
  }

  private mutableRow(charts: StatsPageChartConfig[]): MutableStatsChartLayoutRow {
    return { id: `stats-chart-row-${nextRowId++}`, charts };
  }

  private isLegacyEntry(value: unknown): value is { readonly id: string; readonly enabled?: boolean } {
    return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'id') === 'string';
  }

  private isStoredLayout(value: unknown): value is StoredStatsChartLayout {
    return (
      typeof value === 'object'
      && value !== null
      && Reflect.get(value, 'version') === 4
      && Array.isArray(Reflect.get(value, 'rows'))
      && Array.isArray(Reflect.get(value, 'disabled'))
    );
  }
}
