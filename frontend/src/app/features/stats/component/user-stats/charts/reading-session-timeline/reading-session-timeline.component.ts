import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import {
  addWeeks,
  endOfISOWeek,
  getISOWeek,
  getISOWeekYear,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
} from 'date-fns';

import { type BookType } from '../../../../../book/model/book.model';
import { AppButtonComponent } from '../../../../../../shared/ui/button/app-button.component';
import { AppTooltipDirective } from '../../../../../../shared/ui/tooltip/app-tooltip.directive';
import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import {
  type SessionTimelineStats,
  type TimelineSession,
} from '../../../../data/user/reading-session-timeline-stats';

interface ReadingWeekRange {
  readonly start: Date;
  readonly end: Date;
}

interface TimelineSessionSegment {
  readonly key: string;
  readonly bookId: number;
  readonly bookTitle: string;
  readonly bookType: BookType | null;
  readonly dayIndex: number;
  readonly lane: number;
  readonly laneCount: number;
  readonly startHour: number;
  readonly endHour: number;
  readonly durationMinutes: number;
}

interface TimelineSessionView extends TimelineSessionSegment {
  readonly fill: string;
  readonly border: string;
  readonly timeLabel: string;
  readonly durationLabel: string;
  readonly tooltip: string;
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
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DAY_COUNT = 7;
const MILLISECONDS_PER_MINUTE = 60_000;

@Component({
  selector: 'app-reading-session-timeline',
  standalone: true,
  imports: [
    AppButtonComponent,
    AppTooltipDirective,
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

  private readonly sessionSegments = computed(() =>
    splitSessionsAcrossWeek(
      this.stats().sessions,
      readingWeekRange(this.year(), this.week()),
    ),
  );
  protected readonly hourLabels = computed<readonly string[]>(() => {
    const formatter = new Intl.DateTimeFormat(this.activeLanguage(), {
      hour: 'numeric',
      timeZone: 'UTC',
    });
    return HOURS.map((hour) => formatter.format(Date.UTC(2023, 0, 1, hour)));
  });
  protected readonly weekRangeLabel = computed(() => {
    const { start, end } = readingWeekRange(this.year(), this.week());
    const formatter = new Intl.DateTimeFormat(this.activeLanguage(), {
      month: 'short',
      day: 'numeric',
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  });
  protected readonly days = computed<readonly TimelineDayView[]>(() =>
    Array.from({ length: DAY_COUNT }, (_, dayIndex) => ({
      dayIndex,
      label: this.weekdayLabel(dayIndex),
      sessions: this.sessionSegments()
        .filter((session) => session.dayIndex === dayIndex)
        .map((session) => this.toSessionView(session)),
    })),
  );
  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().sessionCount > 0 ? 'ready' : 'empty';
  });

  protected onWeekStep(delta: number): void {
    this.weekChange.emit(shiftReadingWeek(this.year(), this.week(), delta));
  }

  private toSessionView(session: TimelineSessionSegment): TimelineSessionView {
    const color = session.bookType
      ? BOOK_TYPE_COLORS[session.bookType]
      : DEFAULT_BOOK_TYPE_COLOR;
    const range = `${this.formatHour(session.startHour)} - ${this.formatHour(session.endHour)}`;
    const title =
      session.bookTitle || this.transloco.translate('statsUser.sessionTimeline.readingSession');
    const format =
      session.bookType ?? this.transloco.translate('statsUser.sessionTimeline.unknown');

    return {
      ...session,
      fill: `color-mix(in srgb, ${color} 80%, transparent)`,
      border: color,
      timeLabel: this.formatHour(session.startHour),
      durationLabel: this.formatCompactDuration(session.durationMinutes),
      tooltip: [
        title,
        `${this.transloco.translate('statsUser.sessionTimeline.tooltipTime')} ${range}`,
        `${this.transloco.translate('statsUser.sessionTimeline.tooltipDuration')} ${this.formatDuration(session.durationMinutes)}`,
        `${this.transloco.translate('statsUser.sessionTimeline.tooltipFormat')} ${format}`,
      ].join(' · '),
      showLabels: session.durationMinutes >= 60,
      leftPercent: (session.startHour / 24) * 100,
      widthPercent: Math.max(0.5, ((session.endHour - session.startHour) / 24) * 100),
      topPercent: (session.lane / session.laneCount) * 100,
      heightPercent: 100 / session.laneCount,
    };
  }

  private weekdayLabel(dayIndex: number): string {
    return new Intl.DateTimeFormat(this.activeLanguage(), {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(Date.UTC(2023, 0, 2 + dayIndex));
  }

  private formatHour(hour: number): string {
    const wholeHours = Math.floor(hour);
    const minutes = Math.round((hour - wholeHours) * 60);
    return new Intl.DateTimeFormat(this.activeLanguage(), {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(Date.UTC(2023, 0, 1, wholeHours, minutes));
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

function readingWeekRange(year: number, week: number): ReadingWeekRange {
  const date = setISOWeek(setISOWeekYear(new Date(), year), week);
  return { start: startOfISOWeek(date), end: endOfISOWeek(date) };
}

function shiftReadingWeek(
  year: number,
  week: number,
  delta: number,
): { year: number; week: number } {
  const shifted = addWeeks(readingWeekRange(year, week).start, delta);
  return { year: getISOWeekYear(shifted), week: getISOWeek(shifted) };
}

function splitSessionsAcrossWeek(
  sessions: readonly TimelineSession[],
  range: ReadingWeekRange,
): readonly TimelineSessionSegment[] {
  const weekEnd = new Date(range.start);
  weekEnd.setDate(weekEnd.getDate() + DAY_COUNT);

  const segments = sessions.flatMap<TimelineSessionSegment>((session) => {
    let cursor = session.start < range.start ? range.start : session.start;
    const boundedEnd = session.end > weekEnd ? weekEnd : session.end;
    const sessionSegments: TimelineSessionSegment[] = [];

    while (cursor < boundedEnd) {
      const nextMidnight = startOfNextDay(cursor);
      const end = boundedEnd < nextMidnight ? boundedEnd : nextMidnight;

      sessionSegments.push({
        key: `${session.key}:${cursor.getTime()}`,
        bookId: session.bookId,
        bookTitle: session.bookTitle,
        bookType: session.bookType,
        dayIndex: toIsoDayIndex(cursor),
        lane: 0,
        laneCount: 1,
        startHour: toHour(cursor),
        endHour: end.getTime() === nextMidnight.getTime() ? 24 : toHour(end),
        durationMinutes: (end.getTime() - cursor.getTime()) / MILLISECONDS_PER_MINUTE,
      });

      cursor = end;
    }

    return sessionSegments;
  });

  return assignTimelineLanes(segments);
}

function assignTimelineLanes(
  sessions: readonly TimelineSessionSegment[],
): readonly TimelineSessionSegment[] {
  const positions = new Map<string, { lane: number; laneCount: number }>();

  for (let dayIndex = 0; dayIndex < DAY_COUNT; dayIndex++) {
    const daySessions = sessions
      .filter((session) => session.dayIndex === dayIndex)
      .sort(
        (left, right) =>
          left.startHour - right.startHour || right.endHour - left.endHour,
      );
    let laneEnds: number[] = [];
    let clusterEnd = Number.NEGATIVE_INFINITY;
    let clusterKeys: string[] = [];

    const finishCluster = (): void => {
      const laneCount = laneEnds.length;
      for (const key of clusterKeys) {
        const position = positions.get(key);
        if (position) positions.set(key, { ...position, laneCount });
      }
    };

    for (const session of daySessions) {
      if (session.startHour >= clusterEnd) {
        finishCluster();
        laneEnds = [];
        clusterKeys = [];
        clusterEnd = session.endHour;
      } else {
        clusterEnd = Math.max(clusterEnd, session.endHour);
      }

      const availableLane = laneEnds.findIndex((laneEnd) => session.startHour >= laneEnd);
      const lane = availableLane === -1 ? laneEnds.length : availableLane;
      laneEnds[lane] = session.endHour;
      clusterKeys.push(session.key);
      positions.set(session.key, { lane, laneCount: 1 });
    }

    finishCluster();
  }

  return sessions.map((session) => ({
    ...session,
    ...(positions.get(session.key) ?? { lane: 0, laneCount: 1 }),
  }));
}

function toIsoDayIndex(date: Date): number {
  return (date.getDay() + 6) % DAY_COUNT;
}

function toHour(date: Date): number {
  return (
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600 +
    date.getMilliseconds() / 3_600_000
  );
}

function startOfNextDay(date: Date): Date {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);
  return nextDay;
}
