import { TestBed } from '@angular/core/testing';
import { type TooltipItem, type TooltipModel } from 'chart.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  StatsCategoricalBarComponent,
  type StatsCategoricalBarPlot,
} from './stats-categorical-bar.component';

describe('StatsCategoricalBarComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [StatsCategoricalBarComponent] }));
  afterEach(() => TestBed.resetTestingModule());

  function createComponent(plot: StatsCategoricalBarPlot): StatsCategoricalBarComponent {
    const fixture = TestBed.createComponent(StatsCategoricalBarComponent);
    fixture.componentRef.setInput('plot', plot);
    return fixture.componentInstance;
  }

  it('maps categories, per-value colors, and tooltip content', () => {
    const component = createComponent({
      categories: [{ label: 'Long category', axisLabel: 'Short', tooltipTitle: 'Full title' }],
      series: [{
        label: 'Books',
        color: 'red',
        values: [{ value: 3, color: 'blue', borderColor: 'navy', tooltipLines: ['Three books'] }],
      }],
      primaryAxis: { title: 'Count' },
    });

    const dataset = component.chartData().datasets[0];
    expect(component.chartData().labels).toEqual(['Long category']);
    expect(dataset?.data).toEqual([3]);
    expect(dataset?.backgroundColor).toEqual(['blue']);
    expect(dataset?.borderColor).toEqual(['navy']);

    const callbacks = component.chartOptions().plugins?.tooltip?.callbacks;
    const tooltip = {} as TooltipModel<'bar'>;
    expect(callbacks?.title?.call(tooltip, [{ dataIndex: 0 } as TooltipItem<'bar'>]))
      .toBe('Full title');
    expect(callbacks?.label?.call(
      tooltip,
      { dataIndex: 0, datasetIndex: 0 } as TooltipItem<'bar'>,
    ))
      .toEqual(['Three books']);
  });

  it('maps horizontal orientation and a secondary value axis', () => {
    const component = createComponent({
      categories: [{ label: 'Monday' }],
      series: [
        { label: 'Sessions', color: 'purple', values: [{ value: 2, tooltipLines: ['2'] }] },
        {
          label: 'Hours',
          color: 'pink',
          axis: 'secondary',
          values: [{ value: 1.5, tooltipLines: ['1h 30m'] }],
        },
      ],
      orientation: 'horizontal',
      primaryAxis: { title: 'Sessions' },
      secondaryAxis: { title: 'Hours', position: 'right', drawGrid: false },
    });

    expect(component.chartOptions().indexAxis).toBe('y');
    expect(component.chartOptions().scales?.['x1']).toBeDefined();
    expect(component.chartData().datasets[1]?.xAxisID).toBe('x1');
  });
});
