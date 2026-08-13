import {ChartData, ChartType} from 'chart.js';

interface ChartDataIndex {
  dataIndex: number;
  datasetIndex: number;
}

export function getChartDataPoint<TType extends ChartType, TPoint, TLabel>(
  chartData: ChartData<TType, TPoint[], TLabel>,
  index: ChartDataIndex
): TPoint | undefined {
  return chartData.datasets[index.datasetIndex]?.data[index.dataIndex];
}
