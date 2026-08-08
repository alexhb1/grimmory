import { type SessionArchetypeStats } from '../../../../data/user/session-archetypes-stats';
import {
  type StatsPointFamilyPresentation,
  type StatsPresenterTranslate,
} from './stats-point-family.types';

const DAY_COLORS = ['#ef5350', '#ff9800', '#ffc107', '#66bb6a', '#42a5f5', '#7e57c2', '#ec407a'];

export function presentSessionArchetypes(
  stats: SessionArchetypeStats,
  locale: string,
  translate: StatsPresenterTranslate,
): StatsPointFamilyPresentation {
  const days = stats.days.map((day) => ({
    ...day,
    label: new Date(2000, 0, 1 + day.dayOfWeek).toLocaleDateString(locale, { weekday: 'short' }),
    color: DAY_COLORS[(day.dayOfWeek - 1) % DAY_COLORS.length],
  }));
  const dominant = stats.dominantArchetype === null
    ? '—'
    : translate(`statsUser.sessionArchetypes.archetype_${stats.dominantArchetype}`);

  return {
    kind: 'session-archetypes',
    heading: translate('statsUser.sessionArchetypes.title'),
    description: translate('statsUser.sessionArchetypes.description'),
    emptyMessage: `${translate('statsUser.sessionArchetypes.noData')} ${translate('statsUser.sessionArchetypes.noDataHint')}`,
    hasData: stats.sessionCount > 0,
    xAxisLabel: 'Time of Day',
    yAxisLabel: 'Duration (min)',
    series: days.map((day) => ({
      label: day.label,
      fillColor: `${day.color}AA`,
      borderColor: day.color,
      points: day.points.map((point) => ({ x: point.hourOfDay, y: point.durationMinutes })),
    })),
    legend: days.map((day) => ({ label: day.label, color: day.color })),
    summary: [
      { label: translate('statsUser.sessionArchetypes.sessions'), value: stats.sessionCount },
      {
        label: translate('statsUser.sessionArchetypes.dominantType'),
        value: dominant,
        valueTitle: dominant,
        truncateValue: true,
      },
    ],
  };
}
