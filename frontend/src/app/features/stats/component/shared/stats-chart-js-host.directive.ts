import { Directive, inject } from '@angular/core';
import { Chart, registerables } from 'chart.js';

import { StatsChartThemeService } from './stats-chart-theme.service';

Chart.register(...registerables);

@Directive({
  standalone: true,
})
export class StatsChartJsHostDirective {
  constructor() {
    inject(StatsChartThemeService).activate();
  }
}
