import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { type PersonalRatingStats } from '../../../../data/user/personal-rating-stats';
import {
  StatsCategoricalBarComponent,
  type StatsCategoricalBarPlot,
} from '../../../shared/stats-categorical-bar.component';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';

const RATING_COLORS = [
  '#DC2626', '#EA580C', '#F59E0B', '#EAB308', '#FACC15',
  '#BEF264', '#65A30D', '#16A34A', '#059669', '#2563EB',
] as const;

@Component({
  selector: 'app-personal-rating-chart',
  standalone: true,
  imports: [StatsCategoricalBarComponent, StatsChartCardComponent, TranslocoDirective],
  templateUrl: './personal-rating-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class PersonalRatingChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<PersonalRatingStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalRatedBooks > 0 ? 'ready' : 'empty';
  });
  readonly emptyMessage = computed(() => {
    this.activeLanguage();
    return this.transloco.translate('statsUser.bookFlow.noData');
  });
  readonly plot = computed<StatsCategoricalBarPlot>(() => {
    this.activeLanguage();
    const buckets = this.stats().buckets;
    return {
      categories: buckets.map((bucket) => ({
        label: String(bucket.rating),
        tooltipTitle: this.transloco.translate('statsUser.personalRating.tooltipTitle', {
          label: bucket.rating,
        }),
      })),
      series: [{
        label: this.transloco.translate('statsUser.personalRating.booksByPersonalRating'),
        color: RATING_COLORS[0],
        values: buckets.map((bucket, index) => {
          const color = RATING_COLORS[index % RATING_COLORS.length];
          return {
            value: bucket.bookCount,
            color,
            borderColor: color,
            tooltipLines: [this.transloco.translate(
              bucket.bookCount === 1
                ? 'statsUser.personalRating.tooltipBook'
                : 'statsUser.personalRating.tooltipBooks',
              { value: bucket.bookCount },
            )],
          };
        }),
      }],
      categoryAxisTitle: this.transloco.translate('statsUser.personalRating.axisPersonalRating'),
      primaryAxis: {
        title: this.transloco.translate('statsUser.personalRating.axisNumberOfBooks'),
        stepSize: 1,
        maxTicks: 8,
      },
      padding: { top: 25 },
      axisStyle: 'regular-inter',
    };
  });
}
