import {Component, computed, input} from '@angular/core';
import {barY, defineChart} from '@tanstack/charts';
import {scaleLinear} from '@tanstack/charts/scales/linear';
import {binX} from '@tanstack/charts/transform/bin';

import {type StatsFinishedBook} from '../../../../data/stats-response.models';
import {
  countTicks,
  shorten,
  STATS_CHART_PALETTE,
  STATS_COMPACT_WIDTH,
  STATS_ROTATED_LABELS,
  statsAxis,
  statsBar,
  statsBarBand,
  statsTooltip,
} from '../../../shared/stats-chart-basics';
import {StatsChartPlotComponent} from '../../../shared/stats-chart-plot.component';
import {injectStatsText, STATS_CHART_HOST_CLASS} from '../../../shared/stats-chart-text';
import {type StatsInsight, StatsInsightListComponent} from '../../../shared/stats-insight-list.component';

export interface DaysToFinishData {
  readonly year: number;
  readonly books: readonly StatsFinishedBook[];
}

const BUCKETS = ['underAWeek', 'oneToTwoWeeks', 'twoToFourWeeks', 'oneToTwoMonths', 'twoToThreeMonths', 'threeMonthsOrMore'] as const;
const THRESHOLDS = [0, 7, 14, 28, 60, 90];
const TITLES_WHILE_HOVERING = 5;
const TITLE_LENGTH = 40;

@Component({
  selector: 'app-days-to-finish-chart',
  imports: [StatsChartPlotComponent, StatsInsightListComponent],
  template: `
    <app-stats-chart-plot [options]="chart()" />
    <app-stats-insight-list [items]="insights()" />
  `,
  host: {class: STATS_CHART_HOST_CLASS},
})
export class DaysToFinishChartComponent {
  private readonly text = injectStatsText('statsUser.daysToFinish');

  readonly data = input.required<DaysToFinishData>();

  readonly buckets = computed(() => {
    const books = this.data().books;
    const end = Math.max(...THRESHOLDS, ...books.map(({days}) => days)) + 1;
    return binX(books, {value: 'days', thresholds: [...THRESHOLDS, end]}).map((bin, index) => ({
      ...bin,
      id: BUCKETS[index],
      label: this.text.t(BUCKETS[index]),
    }));
  });

  readonly chart = computed(() => {
    const {t, number} = this.text;
    const buckets = this.buckets();
    const labels = buckets.map(({label}) => label);

    return {
      ariaLabel: t('chartLabel', {year: this.data().year}),
      definition: defineChart({
        chart: ({width}) => ({
          marks: [barY(buckets, {x: 'label', y: 'value', fill: STATS_CHART_PALETTE[0], ...statsBar(width)})],
          scales: {
            x: {
              scale: statsBarBand(labels),
              axis: statsAxis(t('axisTimeToFinish'), undefined, width < STATS_COMPACT_WIDTH ? STATS_ROTATED_LABELS : undefined),
            },
            y: {
              scale: scaleLinear,
              nice: true,
              grid: true,
              axis: statsAxis(t('axisNumberOfBooks'), countTicks(Math.max(0, ...buckets.map(({value}) => value)), number)),
            },
          },
        }),
        focus: 'nearest-x',
        focusRing: false,
        svgAnimation: true,
        tooltip: {
          ...statsTooltip<(typeof buckets)[number]>(([{datum: bucket}], {pinned}) => {
            const shown = pinned ? bucket.source : bucket.source.slice(0, TITLES_WHILE_HOVERING);
            const more = bucket.source.length - shown.length;
            return {
              title: bucket.label,
              rows: [
                {label: t('books'), value: number(bucket.value)},
                ...shown.map((book) => ({label: shorten(book.title || t('untitled'), TITLE_LENGTH), value: this.days(book.days)})),
                ...(more > 0 ? [{label: t('andMore', {count: number(more)}), value: ''}] : []),
              ],
            };
          }),
          className: 'max-h-[70vh] overflow-y-auto',
        },
      }),
    };
  });

  readonly insights = computed<readonly StatsInsight[]>(() => {
    const {t, number} = this.text;
    const books = this.data().books;
    const quickest = books.at(0);
    const longest = books.at(-1);
    if (!quickest || !longest) return [];

    const middle = Math.floor(books.length / 2);
    const median = books.length % 2 === 1 ? books[middle].days : (books[middle - 1].days + books[middle].days) / 2;
    return [
      {label: t('booksFinished'), value: number(books.length), detail: t('withSessions')},
      {label: t('median'), value: this.days(median)},
      {label: t('quickest'), value: this.days(quickest.days), detail: quickest.title || t('untitled')},
      {label: t('longest'), value: this.days(longest.days), detail: longest.title || t('untitled')},
    ];
  });

  private days(count: number): string {
    return this.text.number(count, {style: 'unit', unit: 'day', unitDisplay: 'long', maximumFractionDigits: 0});
  }
}
