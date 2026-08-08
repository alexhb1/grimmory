import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { type PageHeader } from '../../../../shared/layout/page-header/page-header.service';
import { PageTitleService } from '../../../../shared/service/page-title.service';
import { AppMessageComponent } from '../../../../shared/ui/message/app-message.component';
import { UserService } from '../../../settings/user-management/user.service';
import {
  StatsChartGridController,
  type StatsPageChartConfig,
} from '../shared/stats-chart-grid.controller';
import {
  StatsPageShellComponent,
  type StatsPageShellLabels,
} from '../shared/stats-page-shell.component';
import {
  StatsCircularDistributionChartComponent,
  type StatsCircularDistribution,
} from '../shared/stats-circular-distribution-chart.component';
import {
  StatsReadingProfileChartComponent,
  type StatsReadingProfile,
} from '../shared/stats-reading-profile-chart.component';
import {
  StatsLineFamilyChartComponent,
} from '../shared/line-family/stats-line-family-chart.component';
import { type StatsLineFamilyChart } from '../shared/line-family/stats-line-family-chart.types';
import { AllBooksStatsSourceService } from '../../data/all-books-stats-source.service';
import { UserStatsDataService } from './user-stats-data.service';
import { BookFlowChartComponent } from './charts/book-flow-chart/book-flow-chart.component';
import { CompletionTimelineChartComponent } from './charts/completion-timeline-chart/completion-timeline-chart.component';
import { FavoriteDaysChartComponent } from './charts/favorite-days-chart/favorite-days-chart.component';
import { GenreStatsChartComponent } from './charts/genre-stats-chart/genre-stats-chart.component';
import { StatsHeatmapFamilyComponent } from './charts/heatmap-family/stats-heatmap-family.component';
import { type StatsHeatmapFamilyChart } from './charts/heatmap-family/stats-heatmap-family.types';
import { PageTurnerChartComponent } from './charts/page-turner-chart/page-turner-chart.component';
import { PersonalRatingChartComponent } from './charts/personal-rating-chart/personal-rating-chart.component';
import { StatsPointFamilyComponent } from './charts/point-family/stats-point-family.component';
import { type StatsPointFamilyChart } from './charts/point-family/stats-point-family.types';
import { ReadingDebtChartComponent } from './charts/reading-debt-chart/reading-debt-chart.component';
import { ReadingSessionTimelineComponent } from './charts/reading-session-timeline/reading-session-timeline.component';
import { ReadingClockChartComponent } from './charts/reading-clock-chart/reading-clock-chart.component';
import { SeriesProgressChartComponent } from './charts/series-progress-chart/series-progress-chart.component';

const DEFAULT_CHARTS: readonly StatsPageChartConfig[] = [
  { id: 'heatmap', nameKey: 'chartNames.heatmap', size: 'full' },
  { id: 'favorite-days', nameKey: 'chartNames.favoriteDays', size: 'medium' },
  { id: 'peak-hours', nameKey: 'chartNames.peakHours', size: 'medium' },
  { id: 'timeline', nameKey: 'chartNames.timeline', size: 'full' },
  { id: 'personal-rating', nameKey: 'chartNames.personalRating', size: 'small' },
  { id: 'reading-progress', nameKey: 'chartNames.readingProgress', size: 'small' },
  { id: 'read-status', nameKey: 'chartNames.readStatus', size: 'small' },
  { id: 'genre-stats', nameKey: 'chartNames.genreStats', size: 'full' },
  { id: 'reading-heatmap', nameKey: 'chartNames.readingHeatmap', size: 'medium' },
  { id: 'completion-timeline', nameKey: 'chartNames.completionTimeline', size: 'medium' },
  { id: 'reading-clock', nameKey: 'chartNames.readingClock', size: 'medium' },
  { id: 'page-turner', nameKey: 'chartNames.pageTurner', size: 'medium' },
  { id: 'reading-survival', nameKey: 'chartNames.readingSurvival', size: 'medium' },
  { id: 'book-length', nameKey: 'chartNames.bookLength', size: 'medium' },
  { id: 'completion-race', nameKey: 'chartNames.completionRace', size: 'full' },
  { id: 'rating-taste', nameKey: 'chartNames.ratingTaste', size: 'medium' },
  { id: 'reading-debt', nameKey: 'chartNames.readingDebt', size: 'medium' },
  { id: 'series-progress', nameKey: 'chartNames.seriesProgress', size: 'full' },
  { id: 'publication-era', nameKey: 'chartNames.publicationEra', size: 'medium' },
  { id: 'session-archetypes', nameKey: 'chartNames.sessionArchetypes', size: 'medium' },
  { id: 'book-flow', nameKey: 'chartNames.bookFlow', size: 'full' },
  { id: 'reading-habits', nameKey: 'chartNames.readingHabits', size: 'medium' },
  { id: 'reading-dna', nameKey: 'chartNames.readingDna', size: 'medium' },
];

@Component({
  selector: 'app-user-stats',
  standalone: true,
  imports: [
    AppMessageComponent,
    BookFlowChartComponent,
    CompletionTimelineChartComponent,
    FavoriteDaysChartComponent,
    GenreStatsChartComponent,
    PageTurnerChartComponent,
    PersonalRatingChartComponent,
    ReadingClockChartComponent,
    ReadingDebtChartComponent,
    ReadingSessionTimelineComponent,
    SeriesProgressChartComponent,
    StatsCircularDistributionChartComponent,
    StatsLineFamilyChartComponent,
    StatsHeatmapFamilyComponent,
    StatsPageShellComponent,
    StatsPointFamilyComponent,
    StatsReadingProfileChartComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  providers: [AllBooksStatsSourceService, UserStatsDataService],
  templateUrl: './user-stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class UserStatsComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly transloco = inject(TranslocoService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly statsData = inject(UserStatsDataService);
  readonly sessionHeatmapChart = computed<StatsHeatmapFamilyChart>(() => ({
    kind: 'session-calendar',
    stats: this.statsData.sessionHeatmapStats(),
    year: this.statsData.heatmapYear(),
    yearOptions: this.statsData.readingYears(),
  }));
  readonly readingHeatmapChart = computed<StatsHeatmapFamilyChart>(() => ({
    kind: 'reading-months', stats: this.statsData.readingHeatmapStats(),
  }));
  readonly bookLengthPointChart = computed<StatsPointFamilyChart>(() => ({
    kind: 'book-length', stats: this.statsData.bookLengthStats(),
  }));
  readonly ratingTastePointChart = computed<StatsPointFamilyChart>(() => ({
    kind: 'rating-taste', stats: this.statsData.ratingTasteStats(),
  }));
  readonly sessionArchetypesPointChart = computed<StatsPointFamilyChart>(() => ({
    kind: 'session-archetypes',
    stats: this.statsData.sessionArchetypesStats(),
    year: this.statsData.sessionArchetypesYear(),
    yearOptions: this.statsData.readingYears(),
  }));
  readonly peakHoursLineChart = computed<StatsLineFamilyChart>(() => ({
    kind: 'peak-hours',
    stats: this.statsData.peakHoursStats(),
    year: this.statsData.peakHoursParams().year,
    month: this.statsData.peakHoursParams().month,
    yearOptions: this.statsData.readingYears(),
  }));
  readonly publicationEraLineChart = computed<StatsLineFamilyChart>(() => ({
    kind: 'publication-era', stats: this.statsData.publicationEraStats(),
  }));
  readonly completionRaceLineChart = computed<StatsLineFamilyChart>(() => ({
    kind: 'completion-race',
    stats: this.statsData.completionRaceStats(),
    year: this.statsData.completionRaceYear(),
    yearOptions: this.statsData.readingYears(),
  }));
  readonly readingSurvivalLineChart = computed<StatsLineFamilyChart>(() => ({
    kind: 'reading-survival', stats: this.statsData.readingSurvivalStats(),
  }));
  readonly readStatusChart = computed<StatsCircularDistribution>(() => ({
    kind: 'read-status', stats: this.statsData.readStatusStats(),
  }));
  readonly readingProgressChart = computed<StatsCircularDistribution>(() => ({
    kind: 'reading-progress', stats: this.statsData.readingProgressStats(),
  }));
  readonly readingDnaProfile = computed<StatsReadingProfile>(() => ({
    kind: 'dna', stats: this.statsData.readingDnaStats(),
  }));
  readonly readingHabitsProfile = computed<StatsReadingProfile>(() => ({
    kind: 'habits', stats: this.statsData.readingHabitsStats(),
  }));
  readonly userName = computed(() => {
    const user = this.userService.currentUser();
    return user ? user.name || user.username : '';
  });
  readonly pageHeader = computed<PageHeader>(() => {
    this.activeLanguage();
    return {
      title: this.transloco.translate('statsUser.main.title', { name: this.userName() }),
    };
  });

  readonly chartGrid = new StatsChartGridController({
    storageKey: 'userStatsChartConfig',
    defaults: DEFAULT_CHARTS,
    label: (chart) => this.transloco.translate(`statsUser.${chart.nameKey}`),
  });
  readonly showChartDescriptions = signal(true);
  readonly shellLabels = computed<StatsPageShellLabels>(() => {
    this.activeLanguage();
    const chartName = (chart: StatsPageChartConfig) =>
      this.transloco.translate(`statsUser.${chart.nameKey}`);
    return {
      menu: this.transloco.translate('statsUser.config.title'),
      showDescriptions: this.transloco.translate('statsUser.config.showDescriptions'),
      edit: this.transloco.translate('statsUser.config.edit'),
      resetOrder: this.transloco.translate('statsUser.config.resetOrder'),
      addChart: this.transloco.translate('statsUser.config.addChart'),
      done: this.transloco.translate('statsUser.config.done'),
      chartName,
      reorderChart: (chart) =>
        `${chartName(chart)}: ${this.transloco.translate('statsUser.main.dragToReorder')}`,
      removeChart: (chart) =>
        `${this.transloco.translate('statsUser.config.removeChart')}: ${chartName(chart)}`,
      moveChartEarlier: (chart) => this.transloco.translate(
        'statsUser.config.moveChartEarlier',
        { name: chartName(chart) },
      ),
      moveChartLater: (chart) => this.transloco.translate(
        'statsUser.config.moveChartLater',
        { name: chartName(chart) },
      ),
    };
  });

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.transloco.translate('statsUser.main.titleBarTitle'));
  }
}
