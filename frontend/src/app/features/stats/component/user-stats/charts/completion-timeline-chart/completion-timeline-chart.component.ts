import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import { type CompletionTimelineStats } from '../../../../data/user/completion-timeline-stats';
import {
  StatsCategoricalBarComponent,
  type StatsCategoricalBarPlot,
} from '../../../shared/stats-categorical-bar.component';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import {
  StatsChartLegendComponent,
  type StatsChartLegendItem,
} from '../../../shared/stats-chart-legend.component';

type SeriesId = Exclude<keyof CompletionTimelineStats['months'][number], 'month'>;

const SERIES: readonly SeriesId[] = [
  'completed', 'partiallyRead', 'activeReading', 'paused', 'discontinued',
];
const COLORS: Readonly<Record<SeriesId, string>> = {
  completed: 'rgba(106, 176, 76, 0.8)',
  partiallyRead: 'rgba(20, 184, 166, 0.8)',
  activeReading: 'rgba(59, 130, 246, 0.8)',
  paused: 'rgba(255, 193, 7, 0.8)',
  discontinued: 'rgba(239, 68, 68, 0.8)',
};
const LABEL_KEYS: Readonly<Record<SeriesId, string>> = {
  completed: 'statsUser.completionTimeline.completed',
  partiallyRead: 'statsUser.readStatus.partiallyRead',
  activeReading: 'statsUser.completionTimeline.activeReading',
  paused: 'statsUser.completionTimeline.paused',
  discontinued: 'statsUser.completionTimeline.discontinued',
};

@Component({
  selector: 'app-completion-timeline-chart',
  standalone: true,
  imports: [
    AppSelectComponent,
    StatsCategoricalBarComponent,
    StatsChartCardComponent,
    StatsChartLegendComponent,
    TranslocoDirective,
  ],
  templateUrl: './completion-timeline-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class CompletionTimelineChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<CompletionTimelineStats>();
  readonly year = input.required<number>();
  readonly yearOptions = input<readonly number[]>([]);
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly yearChange = output<number>();

  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalBooks > 0 ? 'ready' : 'empty';
  });
  readonly yearSelectOptions = computed<readonly SelectOption<number>[]>(() =>
    this.yearOptions().map((year) => ({ value: year, label: String(year) })),
  );
  readonly yearSelectorLabel = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.peakHours.selectYear');
  });
  readonly legend = computed<readonly (StatsChartLegendItem & { id: SeriesId })[]>(() => {
    this.activeLanguage();
    return SERIES.map((id) => ({
      id,
      label: this.transloco.translate(LABEL_KEYS[id]),
      color: COLORS[id],
    }));
  });
  readonly plot = computed<StatsCategoricalBarPlot>(() => {
    const locale = this.activeLanguage();
    const months = this.stats().months;
    const legend = this.legend();
    return {
      categories: Array.from({ length: 12 }, (_, index) => ({
        label: new Date(2000, index, 1).toLocaleDateString(locale, { month: 'short' }),
      })),
      series: legend.map((entry) => ({
        label: entry.label,
        color: entry.color,
        borderColor: entry.color.replace('0.8)', '1)'),
        values: months.map((month) => {
          const value = month[entry.id];
          return {
            value,
            tooltipLines: [this.transloco.translate(
              value === 1
                ? 'statsUser.completionTimeline.tooltipBook'
                : 'statsUser.completionTimeline.tooltipBooks',
              { label: entry.label, value },
            )],
          };
        }),
      })),
      categoryAxisTitle: this.transloco.translate('statsUser.completionTimeline.axisMonth'),
      primaryAxis: {
        title: this.transloco.translate('statsUser.completionTimeline.axisNumberOfBooks'),
        stepSize: 1,
      },
      axisStyle: 'strong',
    };
  });

  protected onYearChange(year: number | null): void {
    if (year !== null) this.yearChange.emit(year);
  }
}
