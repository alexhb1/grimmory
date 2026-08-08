import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { PageCountStats } from '../../../../data/library/page-count-stats';
import {
  StatsCategoricalBarComponent,
  type StatsCategoricalBarPlot,
} from '../../../shared/stats-categorical-bar.component';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';

const PAGE_COLORS = [
  '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
] as const;

@Component({
  selector: 'app-page-count-chart',
  standalone: true,
  imports: [StatsCategoricalBarComponent, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './page-count-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class PageCountChartComponent {
  private readonly t = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.t.langChanges$, {
    initialValue: this.t.getActiveLang(),
  });

  readonly stats = input.required<PageCountStats>();
  readonly loading = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly state = computed<StatsChartState>(() => {
    if (this.loading()) return 'loading';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });
  readonly plot = computed<StatsCategoricalBarPlot>(() => {
    this.activeLanguage();
    return {
    categories: this.stats().buckets.map((bucket) => ({
      label: bucket.label,
      tooltipTitle: this.t.translate('statsLibrary.pageCount.tooltipTitle', { label: bucket.label }),
    })),
    series: [{
      label: '',
      color: PAGE_COLORS[0],
      values: this.stats().buckets.map((bucket, index) => ({
        value: bucket.bookCount,
        color: PAGE_COLORS[index] ?? PAGE_COLORS[0],
        tooltipLines: [this.t.translate(
          bucket.bookCount === 1
            ? 'statsLibrary.pageCount.tooltipLabel'
            : 'statsLibrary.pageCount.tooltipLabelPlural',
          { value: bucket.bookCount },
        )],
      })),
    }],
    categoryAxisTitle: this.t.translate('statsLibrary.pageCount.axisPageCount'),
    primaryAxis: {
      title: this.t.translate('statsLibrary.pageCount.axisBooks'),
      stepSize: 1,
      maxTicks: 6,
    },
    categoryPercentage: 0.7,
    padding: { top: 10, bottom: 10 },
    axisStyle: 'library-compact',
      tooltipStyle: { kind: 'compact-accent', accent: '#8B5CF6' },
    };
  });
}
