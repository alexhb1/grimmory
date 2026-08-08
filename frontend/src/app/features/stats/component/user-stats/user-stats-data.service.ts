import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { getISOWeek, getISOWeekYear } from 'date-fns';

import { type BookSummary } from '../../../book/data/book-response.models';
import { calculateBookFlowStats } from '../../data/user/book-flow-stats';
import { calculateBookLengthStats } from '../../data/user/book-length-stats';
import { completionRaceQuery, EMPTY_COMPLETION_RACE_STATS } from '../../data/user/completion-race-stats';
import {
  completionTimelineQuery,
  EMPTY_COMPLETION_TIMELINE_STATS,
} from '../../data/user/completion-timeline-stats';
import { EMPTY_FAVORITE_DAYS_STATS, favoriteDaysQuery } from '../../data/user/favorite-days-stats';
import { EMPTY_GENRE_STATS, genreStatsQuery } from '../../data/user/genre-stats';
import { EMPTY_PAGE_TURNER_STATS, pageTurnerStatsQuery } from '../../data/user/page-turner-stats';
import { EMPTY_PEAK_HOURS_STATS, peakHoursQuery } from '../../data/user/peak-hours-stats';
import { calculatePersonalRatingStats } from '../../data/user/personal-rating-stats';
import { calculatePublicationEraStats } from '../../data/user/publication-era-stats';
import { calculateRatingTasteStats } from '../../data/user/rating-taste-stats';
import { EMPTY_READING_CLOCK_STATS, readingClockQuery } from '../../data/user/reading-clock-stats';
import { calculateReadingDebtStats } from '../../data/user/reading-debt-stats';
import { calculateReadingDnaStats } from '../../data/user/reading-dna-stats';
import { calculateReadingHabitsStats } from '../../data/user/reading-habits-stats';
import { calculateReadingHeatmapStats } from '../../data/user/reading-heatmap-stats';
import { calculateReadingProgressStats } from '../../data/user/reading-progress-stats';
import {
  EMPTY_READING_STREAKS,
  EMPTY_SESSION_HEATMAP_CALENDAR,
  mapReadingStreaks,
  readingDatesQuery,
  sessionHeatmapQuery,
} from '../../data/user/reading-session-heatmap-stats';
import {
  EMPTY_SESSION_TIMELINE_STATS,
  sessionTimelineQuery,
} from '../../data/user/reading-session-timeline-stats';
import { calculateReadingSurvivalStats } from '../../data/user/reading-survival-stats';
import { calculateReadStatusStats } from '../../data/user/read-status-stats';
import { calculateSeriesProgressStats } from '../../data/user/series-progress-stats';
import {
  EMPTY_SESSION_ARCHETYPE_STATS,
  sessionArchetypesQuery,
} from '../../data/user/session-archetypes-stats';
import {
  type UserStatsMonthFilter,
  UserStatsQueryCache,
} from '../../data/user/user-stats-transport';
import { AllBooksStatsSourceService } from '../../data/all-books-stats-source.service';

@Injectable()
export class UserStatsDataService {
  private readonly http = inject(HttpClient);
  private readonly bookSource = inject(AllBooksStatsSourceService);

  constructor() {
    inject(UserStatsQueryCache);
  }

  private readonly books = this.bookSource.books;
  readonly statsLoading = this.bookSource.isLoading;
  readonly statsError = this.bookSource.isError;

  readonly personalRatingStats = computed(() => calculatePersonalRatingStats(this.books()));
  readonly readStatusStats = computed(() => calculateReadStatusStats(this.books()));
  readonly readingProgressStats = computed(() => calculateReadingProgressStats(this.books()));
  readonly ratingTasteStats = computed(() => calculateRatingTasteStats(this.books()));
  readonly readingSurvivalStats = computed(() => calculateReadingSurvivalStats(this.books()));
  readonly bookLengthStats = computed(() => calculateBookLengthStats(this.books()));
  readonly readingDnaStats = computed(() => calculateReadingDnaStats(this.books()));
  readonly readingHabitsStats = computed(() => calculateReadingHabitsStats(this.books()));
  readonly readingHeatmapStats = computed(() => calculateReadingHeatmapStats(this.books()));
  readonly seriesProgressStats = computed(() => calculateSeriesProgressStats(this.books()));
  readonly readingDebtStats = computed(() => calculateReadingDebtStats(this.books()));
  readonly publicationEraStats = computed(() => calculatePublicationEraStats(this.books()));
  readonly bookFlowStats = computed(() => calculateBookFlowStats(this.books()));

  private readonly currentYear = new Date().getFullYear();

  readonly heatmapYear = signal(this.currentYear);
  readonly timelineWeek = signal({ year: getISOWeekYear(new Date()), week: getISOWeek(new Date()) });
  readonly favoriteDaysParams = signal<UserStatsMonthFilter>({ year: null, month: null });
  readonly peakHoursParams = signal<UserStatsMonthFilter>({ year: null, month: null });
  readonly completionTimelineYear = signal(this.currentYear);
  readonly completionRaceYear = signal(this.currentYear);
  readonly sessionArchetypesYear = signal(this.currentYear);

  private readonly genreStatsResult = injectQuery(() => genreStatsQuery(this.http));
  private readonly pageTurnerResult = injectQuery(() => pageTurnerStatsQuery(this.http));
  private readonly readingClockResult = injectQuery(() => readingClockQuery(this.http));
  private readonly readingDatesResult = injectQuery(() => readingDatesQuery(this.http));
  private readonly sessionHeatmapResult = injectQuery(() =>
    sessionHeatmapQuery(this.http, this.heatmapYear()),
  );
  private readonly sessionTimelineResult = injectQuery(() =>
    sessionTimelineQuery(this.http, this.timelineWeek().year, this.timelineWeek().week),
  );
  private readonly favoriteDaysResult = injectQuery(() =>
    favoriteDaysQuery(this.http, this.favoriteDaysParams()),
  );
  private readonly peakHoursResult = injectQuery(() =>
    peakHoursQuery(this.http, this.peakHoursParams()),
  );
  private readonly completionTimelineResult = injectQuery(() =>
    completionTimelineQuery(this.http, this.completionTimelineYear()),
  );
  private readonly completionRaceResult = injectQuery(() =>
    completionRaceQuery(this.http, this.completionRaceYear()),
  );
  private readonly sessionArchetypesResult = injectQuery(() =>
    sessionArchetypesQuery(this.http, this.sessionArchetypesYear()),
  );

  readonly genreStats = computed(() => this.genreStatsResult.data() ?? EMPTY_GENRE_STATS);
  readonly genreStatsLoading = computed(() => this.genreStatsResult.isPending());
  readonly genreStatsError = computed(() => this.genreStatsResult.isError());

  readonly pageTurnerStats = computed(() => this.pageTurnerResult.data() ?? EMPTY_PAGE_TURNER_STATS);
  readonly pageTurnerLoading = computed(() => this.pageTurnerResult.isPending());
  readonly pageTurnerError = computed(() => this.pageTurnerResult.isError());

  readonly readingClockStats = computed(
    () => this.readingClockResult.data() ?? EMPTY_READING_CLOCK_STATS,
  );
  readonly readingClockLoading = computed(() => this.readingClockResult.isPending());
  readonly readingClockError = computed(() => this.readingClockResult.isError());

  private readonly readingStreaks = computed(() => {
    const dates = this.readingDatesResult.data();
    return dates ? mapReadingStreaks(dates) : EMPTY_READING_STREAKS;
  });
  readonly sessionHeatmapStats = computed(() => ({
    calendar: this.sessionHeatmapResult.data() ?? EMPTY_SESSION_HEATMAP_CALENDAR,
    streaks: this.readingStreaks(),
  }));
  readonly sessionHeatmapLoading = computed(
    () => this.sessionHeatmapResult.isPending() || this.readingDatesResult.isPending(),
  );
  readonly sessionHeatmapError = computed(
    () => this.sessionHeatmapResult.isError() || this.readingDatesResult.isError(),
  );

  readonly sessionTimelineStats = computed(
    () => this.sessionTimelineResult.data() ?? EMPTY_SESSION_TIMELINE_STATS,
  );
  readonly sessionTimelineLoading = computed(() => this.sessionTimelineResult.isPending());
  readonly sessionTimelineError = computed(() => this.sessionTimelineResult.isError());

  readonly favoriteDaysStats = computed(
    () => this.favoriteDaysResult.data() ?? EMPTY_FAVORITE_DAYS_STATS,
  );
  readonly favoriteDaysLoading = computed(() => this.favoriteDaysResult.isPending());
  readonly favoriteDaysError = computed(() => this.favoriteDaysResult.isError());

  readonly peakHoursStats = computed(() => this.peakHoursResult.data() ?? EMPTY_PEAK_HOURS_STATS);
  readonly peakHoursLoading = computed(() => this.peakHoursResult.isPending());
  readonly peakHoursError = computed(() => this.peakHoursResult.isError());

  readonly completionTimelineStats = computed(
    () => this.completionTimelineResult.data() ?? EMPTY_COMPLETION_TIMELINE_STATS,
  );
  readonly completionTimelineLoading = computed(() => this.completionTimelineResult.isPending());
  readonly completionTimelineError = computed(() => this.completionTimelineResult.isError());

  readonly completionRaceStats = computed(
    () => this.completionRaceResult.data() ?? EMPTY_COMPLETION_RACE_STATS,
  );
  readonly completionRaceLoading = computed(() => this.completionRaceResult.isPending());
  readonly completionRaceError = computed(() => this.completionRaceResult.isError());

  readonly sessionArchetypesStats = computed(
    () => this.sessionArchetypesResult.data() ?? EMPTY_SESSION_ARCHETYPE_STATS,
  );
  readonly sessionArchetypesLoading = computed(() => this.sessionArchetypesResult.isPending());
  readonly sessionArchetypesError = computed(() => this.sessionArchetypesResult.isError());

  readonly readingYears = computed<readonly number[]>(() => {
    const years = Array.from(new Set(
      (this.readingDatesResult.data() ?? [])
        .map(({ date }) => Number(date.slice(0, 4)))
        .filter(Number.isFinite),
    )).sort((left, right) => right - left);
    return years.length > 0 ? years : [this.currentYear];
  });
  readonly completionTimelineYears = computed(() => completionTimelineYears(
    this.books(),
    this.readingYears(),
    this.currentYear,
    this.completionTimelineYear(),
  ));
}

function completionTimelineYears(
  books: readonly BookSummary[],
  sessionYears: readonly number[],
  currentYear: number,
  selectedYear: number,
): readonly number[] {
  const knownYears = new Set([currentYear, selectedYear, ...sessionYears]);

  for (const book of books) {
    if (!book.dateFinished) continue;

    const year = new Date(book.dateFinished).getFullYear();
    if (Number.isFinite(year) && year <= currentYear) knownYears.add(year);
  }

  const firstYear = Math.min(...knownYears);
  return Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => currentYear - index,
  );
}
