import { type HttpClient } from '@angular/common/http';
import { queryOptions } from '@tanstack/angular-query-experimental';

import { type PeakHoursResponse, peakHoursResponseQuery } from './peak-hours-stats';

type ReadingClockReaderType = 'nightOwl' | 'earlyBird' | 'balanced';

const NIGHT_HOURS: readonly number[] = [20, 21, 22, 23, 0, 1, 2];
const MORNING_HOURS: readonly number[] = [5, 6, 7, 8, 9, 10, 11];

export function mapReadingClockStats(response: readonly PeakHoursResponse[]) {
  if (response.length === 0) {
    return { minutesByHour: [], peakHourOfDay: null, totalHours: 0, readerType: 'balanced' } as const;
  }

  const minutesByHour = new Array<number>(24).fill(0);
  let totalSeconds = 0;

  for (const entry of response) {
    if (entry.hourOfDay < 0 || entry.hourOfDay > 23) continue;
    minutesByHour[entry.hourOfDay] = entry.totalDurationSeconds / 60;
    totalSeconds += entry.totalDurationSeconds;
  }

  const peakMinutes = Math.max(...minutesByHour);
  const nightTotal = sumHours(minutesByHour, NIGHT_HOURS);
  const morningTotal = sumHours(minutesByHour, MORNING_HOURS);

  return {
    minutesByHour,
    peakHourOfDay: peakMinutes > 0 ? minutesByHour.indexOf(peakMinutes) : null,
    totalHours: Math.round(totalSeconds / 3600),
    readerType: toReaderType(nightTotal, morningTotal),
  };
}

export type ReadingClockStats = ReturnType<typeof mapReadingClockStats>;

export const EMPTY_READING_CLOCK_STATS: ReadingClockStats = mapReadingClockStats([]);

export function readingClockQuery(http: HttpClient) {
  return queryOptions({
    ...peakHoursResponseQuery(http, { year: null, month: null }),
    select: mapReadingClockStats,
  });
}

function sumHours(minutesByHour: readonly number[], hours: readonly number[]): number {
  return hours.reduce((sum, hour) => sum + minutesByHour[hour], 0);
}

function toReaderType(nightTotal: number, morningTotal: number): ReadingClockReaderType {
  if (nightTotal > morningTotal * 1.2) return 'nightOwl';
  if (morningTotal > nightTotal * 1.2) return 'earlyBird';
  return 'balanced';
}
