import {
  type ReadingMilestoneId,
  type ReadingStreaks,
  type SessionHeatmapCalendar,
} from '../../../../data/user/reading-session-heatmap-stats';
import {
  type StatsHeatmapPresentation,
  type StatsPresenterTranslate,
} from './stats-heatmap-family.types';

const ICONS: Readonly<Record<ReadingMilestoneId, string>> = {
  '7-day-streak': '🔥',
  '30-day-streak': '⚡',
  '100-reading-days': '📚',
  '365-reading-days': '🏆',
  'year-long-streak': '👑',
};
const LABEL_KEYS: Readonly<Record<ReadingMilestoneId, string>> = {
  '7-day-streak': 'milestone7DayStreak',
  '30-day-streak': 'milestone30DayStreak',
  '100-reading-days': 'milestone100ReadingDays',
  '365-reading-days': 'milestone365ReadingDays',
  'year-long-streak': 'milestoneYearOfReading',
};

export function presentSessionCalendar(
  calendar: SessionHeatmapCalendar,
  streaks: ReadingStreaks,
  locale: string,
  translate: StatsPresenterTranslate,
): StatsHeatmapPresentation {
  const count = (value: number) => value.toLocaleString(locale);
  return {
    kind: 'session-calendar',
    heading: translate('statsUser.sessionHeatmap.title'),
    description: translate('statsUser.sessionHeatmap.description'),
    hasData: calendar.totalSessions > 0,
    seriesLabel: translate('statsUser.sessionHeatmap.readingSessions'),
    maximumValue: Math.max(1, calendar.maxCount),
    cells: calendar.cells.map((cell) => ({
      x: cell.week,
      y: cell.weekday,
      v: cell.count,
      date: cell.date,
      tooltipLabel: translate(
        cell.count === 1
          ? 'statsUser.sessionHeatmap.readingSession'
          : 'statsUser.sessionHeatmap.readingSessions_plural',
        { count: cell.count },
      ),
    })),
    monthLabels: calendar.weekMonths.map((month) => new Intl.DateTimeFormat(locale, {
      month: 'short', timeZone: 'UTC',
    }).format(Date.UTC(2023, month, 1))),
    axisLabels: Array.from({ length: 7 }, (_, weekday) => new Intl.DateTimeFormat(locale, {
      weekday: 'short', timeZone: 'UTC',
    }).format(Date.UTC(2023, 0, 2 + weekday))),
    summary: streaks.hasData ? [
      { label: translate('statsUser.sessionHeatmap.currentStreak'), value: count(streaks.currentStreak) },
      { label: translate('statsUser.sessionHeatmap.longestStreak'), value: count(streaks.longestStreak) },
      { label: translate('statsUser.sessionHeatmap.totalDays'), value: count(streaks.totalReadingDays) },
      { label: translate('statsUser.sessionHeatmap.consistency'), value: `${streaks.consistencyPercent}%` },
    ] : [],
    milestones: streaks.milestones.map((milestone) => ({
      ...milestone,
      label: translate(`statsUser.sessionHeatmap.${LABEL_KEYS[milestone.id]}`),
      icon: ICONS[milestone.id],
    })),
    milestonesLabel: translate('statsUser.sessionHeatmap.milestones'),
  };
}
