export type StatsChartSize = 'small' | 'medium' | 'wide' | 'full';

export interface StatsPageChartConfig {
  readonly id: string;
  readonly nameKey: string;
  readonly size: StatsChartSize;
}

export type StatsChartColumnSpan = 4 | 6 | 8 | 12;
export type StatsChartRowLayout = 'single-small' | 'full' | 'halves' | 'thirds' | 'small-wide';

export function isValidStatsChartRow(charts: readonly StatsPageChartConfig[]): boolean {
  if (charts.length <= 1) return true;

  const sizes = charts.map(({ size }) => size);
  if (sizes.length === 3) return sizes.every((size) => size === 'small');
  if (sizes.length > 3) return false;

  const smallCount = sizes.filter((size) => size === 'small').length;
  const mediumCount = sizes.filter((size) => size === 'medium').length;
  const wideCount = sizes.filter((size) => size === 'wide').length;

  return (
    smallCount === 2
    || (smallCount === 1 && mediumCount === 1)
    || mediumCount === 2
    || (smallCount === 1 && wideCount === 1)
  );
}

export function statsChartColumnSpan(
  row: readonly StatsPageChartConfig[],
  chart: StatsPageChartConfig,
): StatsChartColumnSpan {
  if (!isValidStatsChartRow(row) || !row.includes(chart)) {
    throw new Error('Cannot calculate a column span for an invalid chart row');
  }

  const layout = statsChartRowLayout(row);
  if (layout === 'single-small') return 6;
  if (layout === 'full') return 12;
  if (layout === 'thirds') return 4;
  if (layout === 'small-wide') return chart.size === 'wide' ? 8 : 4;
  return 6;
}

export function statsChartRowLayout(row: readonly StatsPageChartConfig[]): StatsChartRowLayout {
  if (!isValidStatsChartRow(row) || row.length === 0) {
    throw new Error('Cannot calculate the layout for an invalid chart row');
  }

  if (row.length === 1) return row[0]?.size === 'small' ? 'single-small' : 'full';
  if (row.length === 3) return 'thirds';
  if (row.some(({ size }) => size === 'wide')) return 'small-wide';
  return 'halves';
}

export function packStatsChartRows(
  charts: readonly StatsPageChartConfig[],
): readonly (readonly StatsPageChartConfig[])[] {
  const rows: StatsPageChartConfig[][] = [];

  for (const chart of charts) {
    const currentRow = rows.at(-1);
    if (currentRow && isValidStatsChartRow([...currentRow, chart])) {
      currentRow.push(chart);
    } else {
      rows.push([chart]);
    }
  }

  return rows;
}
