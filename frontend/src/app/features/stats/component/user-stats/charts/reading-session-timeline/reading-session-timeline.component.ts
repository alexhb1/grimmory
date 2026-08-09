import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { addWeeks, getISOWeek, getISOWeeksInYear, getISOWeekYear } from 'date-fns';

import { type BookType } from '../../../../../book/model/book.model';
import { UrlHelperService } from '../../../../../../shared/service/url-helper.service';
import { AppButtonComponent } from '../../../../../../shared/ui/button/app-button.component';
import { AppSelectComponent } from '../../../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../../../shared/ui/select/app-select.options';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import {
  readingWeekRange,
  type SessionTimelineStats,
  type TimelineSessionSegment,
} from '../../../../data/user/reading-session-timeline-stats';

interface TimelineSessionView extends TimelineSessionSegment {
  readonly fill: string;
  readonly border: string;
  readonly timeLabel: string;
  readonly durationLabel: string;
  readonly title: string;
  readonly timeRange: string;
  readonly fullDurationLabel: string;
  readonly formatLabel: string;
  readonly coverUrl: string;
  readonly accessibleLabel: string;
  readonly showLabels: boolean;
  readonly leftPercent: number;
  readonly widthPercent: number;
  readonly topPercent: number;
  readonly heightPercent: number;
}

interface TimelineDayView {
  readonly dayIndex: number;
  readonly label: string;
  readonly sessions: readonly TimelineSessionView[];
}

const BOOK_TYPE_COLORS: Readonly<Record<BookType, string>> = {
  PDF: 'var(--color-red-600)',
  EPUB: 'var(--color-green-600)',
  CBX: 'var(--color-blue-500)',
  FB2: 'var(--color-pink-500)',
  MOBI: 'var(--color-indigo-500)',
  AZW3: 'var(--color-teal-500)',
  AUDIOBOOK: 'var(--color-yellow-500)',
};

const DEFAULT_BOOK_TYPE_COLOR = BOOK_TYPE_COLORS.EPUB;
const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour} ${hour < 12 ? 'AM' : 'PM'}`;
});
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_COUNT = 7;

@Component({
  selector: 'app-reading-session-timeline',
  standalone: true,
  imports: [
    AppButtonComponent,
    AppSelectComponent,
    LucideChevronLeft,
    LucideChevronRight,
    StatsChartCardComponent,
    TranslocoDirective,
  ],
  templateUrl: './reading-session-timeline.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class ReadingSessionTimelineComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly urlHelper = inject(UrlHelperService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly stats = input.required<SessionTimelineStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);
  readonly year = input.required<number>();
  readonly week = input.required<number>();
  readonly weekChange = output<{ year: number; week: number }>();

  private readonly sessionSegments = computed(() => this.stats().segments);
  protected readonly yearSelectOptions = computed<readonly SelectOption<number>[]>(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set(
      Array.from({ length: 11 }, (_, index) => currentYear - index),
    );
    years.add(this.year());
    return Array.from(years)
      .sort((left, right) => right - left)
      .map((year) => ({ value: year, label: year.toString() }));
  });
  protected readonly weekSelectOptions = computed<readonly SelectOption<number>[]>(() =>
    Array.from({ length: weeksInYear(this.year()) }, (_, index) => {
      const week = index + 1;
      return {
        value: week,
        label: this.transloco.translate('statsUser.sessionTimeline.week', { number: week }),
      };
    }),
  );
  protected readonly hourLabels = HOUR_LABELS;
  protected readonly weekRangeLabel = computed(() => {
    const { start, end } = readingWeekRange(this.year(), this.week());
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  });
  protected readonly days = computed<readonly TimelineDayView[]>(() => {
    this.activeLanguage();
    return Array.from({ length: DAY_COUNT }, (_, dayIndex) => ({
      dayIndex,
      label: this.weekdayLabel(dayIndex),
      sessions: this.sessionSegments()
        .filter((session) => session.dayIndex === dayIndex)
        .map((session) => this.toSessionView(session)),
    }));
  });
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().sessionCount > 0 ? 'ready' : 'empty';
  });

  protected onWeekStep(delta: number): void {
    this.weekChange.emit(shiftReadingWeek(this.year(), this.week(), delta));
  }

  protected onYearChange(year: number | null): void {
    if (year === null) return;
    this.weekChange.emit({ year, week: Math.min(this.week(), weeksInYear(year)) });
  }

  protected onWeekChange(week: number | null): void {
    if (week !== null) this.weekChange.emit({ year: this.year(), week });
  }

  private toSessionView(session: TimelineSessionSegment): TimelineSessionView {
    const color = session.bookType && isKnownBookType(session.bookType)
      ? BOOK_TYPE_COLORS[session.bookType]
      : DEFAULT_BOOK_TYPE_COLOR;
    const range = `${this.formatHour(session.startHour)} - ${this.formatHour(session.endHour)}`;
    const title =
      session.bookTitle || this.transloco.translate('statsUser.sessionTimeline.readingSession');
    const format =
      session.bookType || this.transloco.translate('statsUser.sessionTimeline.unknown') || '';
    const fullDurationLabel = this.formatDuration(session.durationMinutes);
    const timeLabel = this.transloco.translate('statsUser.sessionTimeline.tooltipTime');
    const durationLabel = this.transloco.translate('statsUser.sessionTimeline.tooltipDuration');
    const formatLabel = this.transloco.translate('statsUser.sessionTimeline.tooltipFormat');

    return {
      ...session,
      fill: `color-mix(in srgb, ${color} 80%, transparent)`,
      border: color,
      timeLabel: this.formatHour(session.startHour),
      durationLabel: this.formatCompactDuration(session.durationMinutes),
      title,
      timeRange: range,
      fullDurationLabel,
      formatLabel: format,
      coverUrl: this.urlHelper.getDirectThumbnailUrl(session.bookId),
      accessibleLabel: [
        title,
        `${timeLabel} ${range}`,
        `${durationLabel} ${fullDurationLabel}`,
        `${formatLabel} ${format}`,
      ].join(' · '),
      showLabels: session.durationMinutes >= 60,
      leftPercent: (session.startHour / 24) * 100,
      widthPercent: Math.max(0.5, ((session.endHour - session.startHour) / 24) * 100),
      topPercent: (session.lane / session.laneCount) * 100,
      heightPercent: 100 / session.laneCount,
    };
  }

  private weekdayLabel(dayIndex: number): string {
    return DAY_LABELS[dayIndex] ?? '';
  }

  private formatHour(hour: number): string {
    const normalizedHour = ((Math.floor(hour) % 24) + 24) % 24;
    const minutes = Math.round((hour - Math.floor(hour)) * 60);
    const displayHour = normalizedHour === 0 ? 12 : normalizedHour > 12
      ? normalizedHour - 12
      : normalizedHour;
    return `${displayHour}:${String(minutes).padStart(2, '0')} ${normalizedHour < 12 ? 'AM' : 'PM'}`;
  }

  private formatDuration(minutes: number): string {
    const totalSeconds = Math.round(minutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours) parts.push(`${hours}h`);
    if (remainingMinutes || hours) parts.push(`${remainingMinutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  }

  private formatCompactDuration(minutes: number): string {
    const totalSeconds = Math.round(minutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h${remainingMinutes > 0 ? `${remainingMinutes}m` : ''}`;
    if (remainingMinutes > 0) return `${remainingMinutes}m${seconds > 0 ? `${seconds}s` : ''}`;
    return `${seconds}s`;
  }
}

function isKnownBookType(value: string): value is BookType {
  return Object.hasOwn(BOOK_TYPE_COLORS, value);
}

function shiftReadingWeek(
  year: number,
  week: number,
  delta: number,
): { year: number; week: number } {
  const shifted = addWeeks(readingWeekRange(year, week).start, delta);
  return { year: getISOWeekYear(shifted), week: getISOWeek(shifted) };
}

function weeksInYear(year: number): number {
  return getISOWeeksInYear(new Date(year, 6, 1));
}
