import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import { type FavoriteDaysStats } from '../../../../data/user/favorite-days-stats';
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

const SESSIONS_COLOR = 'rgba(139, 92, 246, 0.8)';
const SESSIONS_BORDER = 'rgba(139, 92, 246, 1)';
const DURATION_COLOR = 'rgba(236, 72, 153, 0.8)';
const DURATION_BORDER = 'rgba(236, 72, 153, 1)';
const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

@Component({
  selector: 'app-favorite-days-chart',
  standalone: true,
  imports: [
    AppSelectComponent,
    StatsCategoricalBarComponent,
    StatsChartCardComponent,
    StatsChartLegendComponent,
    TranslocoDirective,
  ],
  templateUrl: './favorite-days-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class FavoriteDaysChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<FavoriteDaysStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly year = input<number | null>(null);
  readonly month = input<number | null>(null);
  readonly yearOptions = input<readonly number[]>([]);
  readonly paramsChange = output<{ year: number | null; month: number | null }>();

  readonly yearSelectOptions = computed<readonly SelectOption<number>[]>(() =>
    this.yearOptions().map((year) => ({ value: year, label: year.toString() })),
  );
  readonly monthSelectOptions = computed<readonly SelectOption<number>[]>(() => {
    this.activeLanguage();
    return MONTH_KEYS.map((key, index) => ({
      value: index + 1,
      label: this.transloco.translate(`statsUser.favoriteDays.${key}`),
    }));
  });
  readonly legend = computed<readonly StatsChartLegendItem[]>(() => {
    this.activeLanguage();
    return [
      { label: this.transloco.translate('statsUser.favoriteDays.sessions'), color: SESSIONS_BORDER },
      { label: this.transloco.translate('statsUser.favoriteDays.durationHours'), color: DURATION_BORDER },
    ];
  });
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().totalSessions > 0 ? 'ready' : 'empty';
  });
  readonly plot = computed<StatsCategoricalBarPlot>(() => {
    this.activeLanguage();
    const days = this.stats().days;
    const sessionsLabel = this.transloco.translate('statsUser.favoriteDays.sessions');
    const durationLabel = this.transloco.translate('statsUser.favoriteDays.durationHours');
    return {
      categories: days.map((day) => ({ label: this.weekdayLabel(day.dayIndex) })),
      series: [
        {
          label: sessionsLabel,
          color: SESSIONS_COLOR,
          borderColor: SESSIONS_BORDER,
          values: days.map((day) => ({
            value: day.sessionCount,
            tooltipLines: [this.transloco.translate(
              day.sessionCount === 1
                ? 'statsUser.favoriteDays.tooltipSessions'
                : 'statsUser.favoriteDays.tooltipSessionsPlural',
              { label: sessionsLabel, value: day.sessionCount },
            )],
          })),
        },
        {
          label: durationLabel,
          color: DURATION_COLOR,
          borderColor: DURATION_BORDER,
          axis: 'secondary',
          values: days.map((day) => ({
            value: day.durationHours,
            tooltipLines: [`${durationLabel}: ${this.formatHours(day.durationHours)}`],
          })),
        },
      ],
      categoryAxisTitle: this.transloco.translate('statsUser.favoriteDays.axisDayOfWeek'),
      primaryAxis: {
        title: this.transloco.translate('statsUser.favoriteDays.axisNumberOfSessions'),
        position: 'left',
        titleColor: SESSIONS_BORDER,
        stepSize: 1,
      },
      secondaryAxis: {
        title: this.transloco.translate('statsUser.favoriteDays.axisDurationHours'),
        position: 'right',
        titleColor: DURATION_BORDER,
        formatTick: (value) => `${value.toFixed(1)}h`,
        drawGrid: false,
      },
      axisStyle: 'strong',
    };
  });

  protected onYearChange(year: number | null): void {
    this.paramsChange.emit({ year, month: this.month() });
  }

  protected onMonthChange(month: number | null): void {
    this.paramsChange.emit({ year: this.year(), month });
  }

  private weekdayLabel(dayIndex: number): string {
    return new Intl.DateTimeFormat(this.activeLanguage(), {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(Date.UTC(2023, 0, 1 + dayIndex));
  }

  private formatHours(value: number): string {
    const hours = Math.floor(value);
    const minutes = Math.round((value % 1) * 60);
    return `${hours}h ${minutes}m`;
  }
}
