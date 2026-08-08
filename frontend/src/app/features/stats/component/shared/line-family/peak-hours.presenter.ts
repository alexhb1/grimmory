import { type PeakHoursStats } from '../../../data/user/peak-hours-stats';
import { type LineChartView, type LinePresenterContext } from './stats-line-family-chart.types';

const PREFIX = 'statsUser.peakHours';
const SESSIONS_COLOR = 'rgba(34, 197, 94, 0.9)';
const DURATION_COLOR = 'rgba(251, 191, 36, 0.9)';

export function buildPeakHoursView(
  stats: PeakHoursStats,
  { locale, translate }: LinePresenterContext,
): LineChartView {
  const sessionsLabel = translate(`${PREFIX}.sessions`);
  const durationLabel = translate(`${PREFIX}.avgDurationMin`);
  const labels = stats.hours.map(({ hour }) =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(
      Date.UTC(2023, 0, 1, hour),
    ),
  );

  return {
    heading: translate(`${PREFIX}.title`),
    description: translate(`${PREFIX}.description`),
    emptyMessage: 'No data available',
    hasData: stats.totalSessions > 0,
    sectionedHeader: true,
    labels,
    series: [
      {
        id: 'sessions', label: sessionsLabel, color: SESSIONS_COLOR,
        fillColor: 'rgba(34, 197, 94, 0.1)', axis: 'y', fill: true, tension: 0.4,
        borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2,
        points: stats.hours.map(({ sessionCount: value }) => ({
          value,
          tooltipLines: [translate(
            `${PREFIX}.${value === 1 ? 'tooltipSessions' : 'tooltipSessionsPlural'}`,
            { label: sessionsLabel, value },
          )],
        })),
      },
      {
        id: 'duration', label: durationLabel, color: DURATION_COLOR,
        fillColor: 'rgba(251, 191, 36, 0.1)', axis: 'y1', fill: true, tension: 0.4,
        borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2,
        points: stats.hours.map(({ averageDurationMinutes: value }) => ({
          value,
          tooltipLines: [translate(`${PREFIX}.tooltipMin`, { label: durationLabel, value })],
        })),
      },
    ],
    xAxis: {
      title: translate(`${PREFIX}.axisHourOfDay`), titleSize: 13, titleWeight: 'bold',
      tickSize: 11, rotation: 0, autoSkipPadding: 12,
    },
    yAxes: [
      {
        title: translate(`${PREFIX}.axisNumberOfSessions`), type: 'linear', position: 'left',
        beginAtZero: true,
        titleColor: SESSIONS_COLOR, titleSize: 13, titleWeight: 'bold', tickSize: 11, stepSize: 1,
      },
      {
        title: translate(`${PREFIX}.axisAvgDuration`), type: 'linear', position: 'right',
        beginAtZero: true,
        titleColor: DURATION_COLOR, titleSize: 13, titleWeight: 'bold', tickSize: 11,
        tickFormat: 'minutes', drawOnChartArea: false,
      },
    ],
    legend: [
      { id: 'sessions', label: sessionsLabel, color: SESSIONS_COLOR },
      { id: 'duration', label: durationLabel, color: DURATION_COLOR },
    ],
    tooltipTitleSize: 14,
    tooltipBodySize: 13,
  };
}
