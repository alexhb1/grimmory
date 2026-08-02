import { describe, expect, it } from 'vitest';

import {
  isValidStatsChartRow,
  packStatsChartRows,
  statsChartColumnSpan,
  type StatsPageChartConfig,
  type StatsChartSize,
} from './stats-chart-layout';

function chart(id: string, size: StatsChartSize): StatsPageChartConfig {
  return { id, nameKey: id, size };
}

describe('stats chart layout', () => {
  it('accepts each supported row combination', () => {
    const small = chart('small', 'small');
    const secondSmall = chart('second-small', 'small');
    const thirdSmall = chart('third-small', 'small');
    const medium = chart('medium', 'medium');
    const secondMedium = chart('second-medium', 'medium');
    const wide = chart('wide', 'wide');

    expect(isValidStatsChartRow([small])).toBe(true);
    expect(isValidStatsChartRow([small, secondSmall])).toBe(true);
    expect(isValidStatsChartRow([small, secondSmall, thirdSmall])).toBe(true);
    expect(isValidStatsChartRow([small, medium])).toBe(true);
    expect(isValidStatsChartRow([medium, secondMedium])).toBe(true);
    expect(isValidStatsChartRow([small, wide])).toBe(true);
  });

  it('rejects combinations that cannot fill one row', () => {
    const small = chart('small', 'small');
    const medium = chart('medium', 'medium');
    const wide = chart('wide', 'wide');
    const full = chart('full', 'full');

    expect(isValidStatsChartRow([medium, wide])).toBe(false);
    expect(isValidStatsChartRow([wide, wide])).toBe(false);
    expect(isValidStatsChartRow([small, full])).toBe(false);
    expect(isValidStatsChartRow([medium, full])).toBe(false);
    expect(isValidStatsChartRow([small, medium, wide])).toBe(false);
  });

  it('assigns the approved column spans', () => {
    const small = chart('small', 'small');
    const secondSmall = chart('second-small', 'small');
    const thirdSmall = chart('third-small', 'small');
    const medium = chart('medium', 'medium');
    const wide = chart('wide', 'wide');
    const full = chart('full', 'full');

    expect(statsChartColumnSpan([small], small)).toBe(6);
    expect(statsChartColumnSpan([medium], medium)).toBe(12);
    expect(statsChartColumnSpan([wide], wide)).toBe(12);
    expect(statsChartColumnSpan([full], full)).toBe(12);
    expect(statsChartColumnSpan([small, secondSmall], small)).toBe(6);
    expect(statsChartColumnSpan([small, secondSmall, thirdSmall], small)).toBe(4);
    expect(statsChartColumnSpan([small, wide], small)).toBe(4);
    expect(statsChartColumnSpan([small, wide], wide)).toBe(8);
  });

  it('packs charts in order without letting one row consume a later gap', () => {
    const charts = [
      chart('wide', 'wide'),
      chart('first-small', 'small'),
      chart('medium', 'medium'),
      chart('second-small', 'small'),
      chart('full', 'full'),
      chart('third-small', 'small'),
    ];

    expect(packStatsChartRows(charts).map((row) => row.map(({ id }) => id))).toEqual([
      ['wide', 'first-small'],
      ['medium', 'second-small'],
      ['full'],
      ['third-small'],
    ]);
  });
});
